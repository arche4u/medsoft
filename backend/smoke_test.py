"""End-to-end smoke test for the recent SRS / baseline / E6 / change-impact work.

Run with: `python smoke_test.py` against a seeded DB.

Strategy: create a fresh test project per run, exercise every flow against
it, then drop the project (cascades clean up everything). Idempotent and
doesn't dirty the seeded demo data.

Each scenario prints ✓/✗ with a short label. Final summary reports
pass/fail counts and exits non-zero on any failure.
"""
import asyncio
import sys
import uuid
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

# Import every model so the SQLAlchemy mapper resolves cross-module
# relationships before we start querying.
import app.modules.projects.model           # noqa: F401
import app.modules.requirements.model       # noqa: F401
import app.modules.testcases.model          # noqa: F401
import app.modules.tracelinks.model         # noqa: F401
import app.modules.risks.model              # noqa: F401
import app.modules.design.model             # noqa: F401
import app.modules.verification.model       # noqa: F401
import app.modules.validation.model         # noqa: F401
import app.modules.config_mgmt.model        # noqa: F401
import app.modules.sdp.model                # noqa: F401
import app.modules.audit.model              # noqa: F401

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import (
    create_async_engine, async_sessionmaker, AsyncSession,
)

from app.core.config import settings
from app.modules.projects.model import Project
from app.modules.requirements.model import (
    Requirement, RequirementCategory,
    RequirementsBaseline, RequirementsBaselineComponent,
    RequirementCategoryBaseline,
)
from app.modules.requirements.router import (
    _ensure_builtins,
    _next_readable_id,
    _validate_hierarchy,
    _collect_descendants,
)
from app.modules.requirements.lock import (
    assert_category_unlocked, is_category_locked,
)
from app.modules.requirements.seed import seed_approved_srs
from app.modules.requirements.category_baseline_router import (
    _snapshot_category_requirements,
)
from app.modules.traceability.router import get_traceability_tree


PASSED: list[str] = []
FAILED: list[tuple[str, str]] = []


def ok(label: str) -> None:
    PASSED.append(label)
    print(f"  ✓ {label}")


def fail(label: str, why: str) -> None:
    FAILED.append((label, why))
    print(f"  ✗ {label}\n      {why}")


@asynccontextmanager
async def session():
    engine = create_async_engine(settings.DATABASE_URL)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as db:
            yield db
    finally:
        await engine.dispose()


# ── Scenarios ────────────────────────────────────────────────────────────────

async def scenario_categories_and_prefix(db: AsyncSession, project_id) -> None:
    print("\n[1] E6: dynamic categories + readable_id_prefix")
    # _ensure_builtins should create the three starter categories with prefixes
    # AND the parent chain wired (SYSTEM→USER, SOFTWARE→SYSTEM).
    await _ensure_builtins(db, project_id)
    await db.flush()
    cats = (await db.execute(
        select(RequirementCategory).where(RequirementCategory.project_id == project_id)
        .order_by(RequirementCategory.sort_order)
    )).scalars().all()
    by_name = {c.name: c for c in cats}

    if len(cats) >= 3:
        ok(f"_ensure_builtins seeded {len(cats)} categories")
    else:
        fail("_ensure_builtins seed", f"got {len(cats)} cats, expected ≥3")
        return

    if by_name["USER"].readable_id_prefix == "URQ":
        ok("USER has prefix URQ")
    else:
        fail("USER prefix", f"got {by_name['USER'].readable_id_prefix!r}")

    if by_name["SYSTEM"].parent_id == by_name["USER"].id:
        ok("SYSTEM.parent_id wired to USER")
    else:
        fail("SYSTEM parent wire", "not linked")

    if by_name["SOFTWARE"].parent_id == by_name["SYSTEM"].id:
        ok("SOFTWARE.parent_id wired to SYSTEM")
    else:
        fail("SOFTWARE parent wire", "not linked")

    # Custom category with prefix
    reg = RequirementCategory(
        project_id=project_id, name="REGULATORY",
        label="Regulatory Requirements", color="#ff7043",
        is_builtin=False, sort_order=10,
        readable_id_prefix="REG",
        parent_id=by_name["USER"].id,
    )
    db.add(reg)
    await db.flush()
    ok("created custom REGULATORY category with prefix=REG, parent=USER")

    # Validate the readable-id generator picks up the custom prefix
    rid = await _next_readable_id(db, project_id, reg)
    if rid.startswith("REG-"):
        ok(f"_next_readable_id used custom prefix: {rid}")
    else:
        fail("_next_readable_id", f"got {rid!r}, expected REG-NNN")


async def scenario_hierarchy(db: AsyncSession, project_id) -> None:
    print("\n[2] E6: dynamic hierarchy validation via category.parent_id")
    cats = (await db.execute(
        select(RequirementCategory).where(RequirementCategory.project_id == project_id)
    )).scalars().all()
    by_name = {c.name: c for c in cats}

    user_cat = by_name["USER"]
    sys_cat = by_name["SYSTEM"]

    # USER (top-level) with parent_id set → should fail
    try:
        await _validate_hierarchy(db, user_cat, parent_id=uuid.uuid4())
        fail("USER with parent rejected", "validation passed unexpectedly")
    except Exception as e:
        if "top-level" in str(e):
            ok("USER req with parent → rejected (top-level rule)")
        else:
            fail("USER parent rejection", str(e))

    # SYSTEM without parent → should fail
    try:
        await _validate_hierarchy(db, sys_cat, parent_id=None)
        fail("SYSTEM without parent rejected", "validation passed unexpectedly")
    except Exception as e:
        if "must have a parent" in str(e):
            ok("SYSTEM req without parent → rejected")
        else:
            fail("SYSTEM no-parent rejection", str(e))

    # Create USER then SYSTEM, verify happy path
    user_req = Requirement(
        project_id=project_id, type="USER", readable_id="URQ-001",
        title="Smoke USER", description="test",
    )
    db.add(user_req)
    await db.flush()
    try:
        await _validate_hierarchy(db, sys_cat, parent_id=user_req.id)
        ok("SYSTEM req with USER parent → accepted")
    except Exception as e:
        fail("SYSTEM happy path", str(e))


async def scenario_change_impact(db: AsyncSession, project_id) -> None:
    print("\n[3] B-bonus2: cross-category change-impact propagation")
    cats = (await db.execute(
        select(RequirementCategory).where(RequirementCategory.project_id == project_id)
    )).scalars().all()
    by_name = {c.name: c for c in cats}

    # Build a small chain: USER → SYSTEM → SOFTWARE
    user_req = (await db.execute(
        select(Requirement).where(
            Requirement.project_id == project_id,
            Requirement.type == "USER",
        ).limit(1)
    )).scalar_one_or_none()
    if not user_req:
        user_req = Requirement(
            project_id=project_id, type="USER", readable_id="URQ-100",
            title="impact-test USER", description="root",
        )
        db.add(user_req); await db.flush()
    sys_req = Requirement(
        project_id=project_id, type="SYSTEM", readable_id="SYS-100",
        title="impact-test SYSTEM", description="child",
        parent_id=user_req.id,
    )
    sw_req = Requirement(
        project_id=project_id, type="SOFTWARE", readable_id="SWR-100",
        title="impact-test SOFTWARE", description="grandchild",
    )
    db.add_all([sys_req, sw_req])
    await db.flush()
    sw_req.parent_id = sys_req.id
    await db.flush()

    descendants = await _collect_descendants(db, user_req.id)
    desc_ids = {d.id for d in descendants}
    if sys_req.id in desc_ids and sw_req.id in desc_ids:
        ok(f"_collect_descendants found USER→SYS→SW chain ({len(descendants)} total)")
    else:
        fail("descendants chain", f"missing rows; got {len(descendants)}")


async def scenario_two_tier_baseline(db: AsyncSession, project_id) -> None:
    print("\n[4] Two-tier baseline: per-category + composite + CM mirror")
    # Need at least one req per category for snapshot to be non-empty
    cats = (await db.execute(
        select(RequirementCategory).where(RequirementCategory.project_id == project_id)
    )).scalars().all()
    by_name = {c.name: c for c in cats}

    # Make sure each builtin category has at least one req
    for cname in ("USER", "SYSTEM", "SOFTWARE"):
        existing = (await db.execute(
            select(Requirement).where(
                Requirement.project_id == project_id,
                Requirement.type == cname,
            ).limit(1)
        )).scalar_one_or_none()
        if not existing:
            r = Requirement(
                project_id=project_id, type=cname,
                readable_id=f"{by_name[cname].readable_id_prefix}-200",
                title=f"baseline-test {cname}",
            )
            db.add(r); await db.flush()

    composite = await seed_approved_srs(db, project_id=project_id, version="1.0")
    await db.flush()

    if composite.status == "APPROVED" and composite.cm_baseline_id is not None:
        ok(f"composite v{composite.version} APPROVED + mirrored to CM")
    else:
        fail("composite seeded", f"status={composite.status} cm={composite.cm_baseline_id}")

    components = (await db.execute(
        select(RequirementsBaselineComponent).where(
            RequirementsBaselineComponent.composite_baseline_id == composite.id
        )
    )).scalars().all()
    if len(components) >= 3:
        ok(f"composite has {len(components)} category components")
    else:
        fail("composite components", f"got {len(components)}")

    # Per-category lock: USER should be locked now (no DRAFT, APPROVED exists)
    if await is_category_locked(db, project_id, "USER"):
        ok("USER locked after approval (per-category)")
    else:
        fail("USER lock", "expected locked")

    # SYSTEM still locked
    if await is_category_locked(db, project_id, "SYSTEM"):
        ok("SYSTEM locked after approval (per-category)")
    else:
        fail("SYSTEM lock", "expected locked")

    # assert_category_unlocked should raise
    try:
        await assert_category_unlocked(db, project_id, "USER")
        fail("assert_category_unlocked USER", "no exception raised")
    except Exception:
        ok("assert_category_unlocked USER → raises HTTPException")

    # Fork USER → new DRAFT → USER becomes unlocked
    user_baseline = (await db.execute(
        select(RequirementCategoryBaseline).where(
            RequirementCategoryBaseline.project_id == project_id,
            RequirementCategoryBaseline.category_name == "USER",
            RequirementCategoryBaseline.status == "APPROVED",
        ).limit(1)
    )).scalar_one_or_none()
    if not user_baseline:
        fail("approved USER baseline", "not found")
        return
    fork = RequirementCategoryBaseline(
        project_id=project_id, category_name="USER", version="1.1", status="DRAFT",
    )
    db.add(fork); await db.flush()
    if not await is_category_locked(db, project_id, "USER"):
        ok("after fork DRAFT, USER unlocked again")
    else:
        fail("post-fork USER lock", "still locked")
    # SYSTEM still locked
    if await is_category_locked(db, project_id, "SYSTEM"):
        ok("SYSTEM still locked (per-category independence)")
    else:
        fail("SYSTEM still locked", "got unlocked")


async def scenario_traceability(db: AsyncSession, project_id) -> None:
    print("\n[5] Dynamic traceability tree (cross-module)")
    tree = await get_traceability_tree(project_id, db)
    if not tree:
        fail("traceability tree", "empty")
        return
    n_roots = len(tree)
    n_l1 = sum(len(r.get("children", [])) for r in tree)
    n_l2 = sum(len(c.get("children", [])) for r in tree for c in r.get("children", []))
    ok(f"tree walked: {n_roots} roots, {n_l1} L1, {n_l2} L2 nodes")
    # Verify leaf attachments present (design_elements/testcases keys)
    leaf_with_design = any(
        ("design_elements" in c) or any("design_elements" in gc for gc in c.get("children", []))
        for r in tree for c in r.get("children", [])
    )
    if n_l2 > 0:
        # Find any L2 node and confirm it has the leaf-attached keys
        l2 = next((gc for r in tree for c in r.get("children", []) for gc in c.get("children", [])), None)
        if l2 is not None and "design_elements" in l2 and "testcases" in l2:
            ok("leaf nodes carry design_elements + testcases")
        else:
            fail("leaf attachments", f"l2 keys: {list(l2.keys()) if l2 else 'none'}")
    else:
        ok("(no L2 leaves to verify attachments — test project)")


async def scenario_validation_root_category(db: AsyncSession, project_id) -> None:
    print("\n[6] Validation accepts any root-category requirement (not just literal USER)")
    from app.modules.requirements.model import RequirementCategory as RC

    # Pick a USER requirement (root category)
    user_req = (await db.execute(
        select(Requirement).where(
            Requirement.project_id == project_id,
            Requirement.type == "USER",
        ).limit(1)
    )).scalar_one()
    cat = (await db.execute(
        select(RC).where(
            RC.project_id == project_id, RC.name == user_req.type,
        )
    )).scalar_one()
    if cat.parent_id is None:
        ok(f"USER (root-category) requirement is valid validation target")
    else:
        fail("root category check", f"USER has parent_id={cat.parent_id}")

    # SOFTWARE (non-root) should NOT be a valid validation target
    sw_req = (await db.execute(
        select(Requirement).where(
            Requirement.project_id == project_id,
            Requirement.type == "SOFTWARE",
        ).limit(1)
    )).scalar_one_or_none()
    if sw_req:
        sw_cat = (await db.execute(
            select(RC).where(RC.project_id == project_id, RC.name == sw_req.type)
        )).scalar_one()
        if sw_cat.parent_id is not None:
            ok("SOFTWARE is non-root → would be rejected by validation")
        else:
            fail("SOFTWARE non-root check", "SOFTWARE is unexpectedly root")


async def main() -> int:
    print(f"=== smoke test against {settings.DATABASE_URL} ===")
    # Use a unique test project so we don't dirty seeded data.
    test_project_id = None
    async with session() as db:
        proj = Project(name=f"SMOKE-{int(time.time())}", description="auto-cleanup")
        db.add(proj)
        await db.flush()
        test_project_id = proj.id
        print(f"created throwaway project {test_project_id}\n")
        try:
            await scenario_categories_and_prefix(db, proj.id)
            await scenario_hierarchy(db, proj.id)
            await scenario_change_impact(db, proj.id)
            await scenario_two_tier_baseline(db, proj.id)
            await scenario_traceability(db, proj.id)
            await scenario_validation_root_category(db, proj.id)
            await db.commit()
        finally:
            # Cleanup: drop the test project (cascades take care of children).
            await db.rollback()
            async with session() as db2:
                await db2.execute(text("DELETE FROM projects WHERE id = :pid"), {"pid": test_project_id})
                await db2.commit()
            print(f"\n=== cleaned up project {test_project_id} ===")

    print(f"\n=== summary: {len(PASSED)} pass · {len(FAILED)} fail ===")
    if FAILED:
        for label, why in FAILED:
            print(f"  ✗ {label}: {why}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
