"""
Phase 4 seed: creates roles, permissions, and default users.

Run AFTER seed.py and seed_phase2.py:
    python seed_phase4.py
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.modules.platform.roles.model import Role, Permission, RolePermission
from app.modules.platform.users.model import User
from app.modules.platform.training.model import TrainingRecord
from app.modules.platform.esign.model import ElectronicSignature  # noqa: F401 — resolves User relationship
from app.modules.platform.auth.security import hash_password

engine = create_async_engine(settings.DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

ALL_PERMISSIONS = [
    # Requirements
    ("READ_REQUIREMENT",         "View requirements"),
    ("CREATE_REQUIREMENT",       "Create requirements"),
    ("UPDATE_REQUIREMENT",       "Update requirements"),
    ("DELETE_REQUIREMENT",       "Delete requirements"),
    # Risks
    ("READ_RISK",                "View risk records"),
    ("CREATE_RISK",              "Create risk records"),
    ("UPDATE_RISK",              "Update risk records"),
    ("DELETE_RISK",              "Delete risk records"),
    # Software Items (IEC 62304 §4.3 — software safety classification)
    ("READ_SOFTWARE_ITEM",       "View software items"),
    ("CREATE_SOFTWARE_ITEM",     "Create software items"),
    ("UPDATE_SOFTWARE_ITEM",     "Update software items"),
    ("DELETE_SOFTWARE_ITEM",     "Delete software items"),
    # Architecture (IEC 62304 §5.3 — software architectural design)
    ("READ_ARCHITECTURE",        "View architecture components"),
    ("CREATE_ARCHITECTURE",      "Create architecture components and interfaces"),
    ("UPDATE_ARCHITECTURE",      "Update architecture components, interfaces, baselines"),
    ("DELETE_ARCHITECTURE",      "Delete architecture components and interfaces"),
    # Design
    ("READ_DESIGN",              "View design elements"),
    ("CREATE_DESIGN",            "Create design elements"),
    ("UPDATE_DESIGN",            "Update design elements"),
    ("DELETE_DESIGN",            "Delete design elements"),
    # Software Units (IEC 62304 §5.5 — unit implementation and verification)
    ("READ_SOFTWARE_UNIT",       "View software units"),
    ("CREATE_SOFTWARE_UNIT",     "Create software units"),
    ("UPDATE_SOFTWARE_UNIT",     "Update software units, artifacts, unit test cases"),
    ("DELETE_SOFTWARE_UNIT",     "Delete software units"),
    # Integration Tests (IEC 62304 §5.6 — software integration and testing)
    ("READ_INTEGRATION_TEST",    "View integration test cases"),
    ("CREATE_INTEGRATION_TEST",  "Create integration test cases"),
    ("UPDATE_INTEGRATION_TEST",  "Update integration test cases and traceability links"),
    ("DELETE_INTEGRATION_TEST",  "Delete integration test cases"),
    # System Tests (IEC 62304 §5.7 — software system testing)
    ("READ_SYSTEM_TEST",         "View system test cases"),
    ("CREATE_SYSTEM_TEST",       "Create system test cases"),
    ("UPDATE_SYSTEM_TEST",       "Update system test cases and traceability links"),
    ("DELETE_SYSTEM_TEST",       "Delete system test cases"),
    # Testing
    ("READ_TESTCASE",            "View test cases"),
    ("CREATE_TESTCASE",          "Create test cases"),
    ("EXECUTE_TEST",             "Record test executions"),
    # Validation
    ("CREATE_VALIDATION",        "Create validation records"),
    ("UPDATE_VALIDATION",        "Update validation records"),
    # Change Control
    ("CREATE_CHANGE_REQUEST",    "Create change requests"),
    ("APPROVE_CHANGE_REQUEST",   "Approve or reject change requests"),
    ("IMPLEMENT_CHANGE",         "Mark change requests as implemented"),
    # Feedback Intake (IEC 62304 §6.2.1 — post-market surveillance)
    ("READ_FEEDBACK",            "View feedback items"),
    ("CREATE_FEEDBACK",          "Log new feedback items"),
    ("UPDATE_FEEDBACK",          "Edit feedback metadata before evaluation"),
    ("EVALUATE_FEEDBACK",        "Evaluate, escalate, and close feedback items"),
    ("DELETE_FEEDBACK",          "Delete new (untriaged) feedback items"),
    # Release
    ("CREATE_RELEASE",           "Create release drafts"),
    ("APPROVE_RELEASE",          "Approve releases"),
    ("PUBLISH_RELEASE",          "Publish approved releases"),
    # Documents & DHF
    ("READ_DOCUMENT",            "View documents"),
    ("UPDATE_DOCUMENT",          "Edit document status and notes"),
    ("GENERATE_DHF",             "Generate Design History File"),
    # Configuration Management (IEC 62304 §8)
    ("CREATE_CONFIG_ITEM",       "Create configuration items"),
    ("UPDATE_CONFIG_ITEM",       "Update configuration items"),
    ("DELETE_CONFIG_ITEM",       "Delete configuration items"),
    ("CREATE_BASELINE",          "Create CM baselines"),
    ("UPDATE_BASELINE",          "Update CM baselines + add/remove items"),
    ("DELETE_BASELINE",          "Delete CM baselines"),
    ("RELEASE_BASELINE",         "Lock a CM baseline for release"),
    # CAPA / Problem Resolution (IEC 62304 §9)
    ("CREATE_PROBLEM_REPORT",    "Create problem reports"),
    ("UPDATE_PROBLEM_REPORT",    "Update problem reports + root causes"),
    ("DELETE_PROBLEM_REPORT",    "Delete problem reports"),
    ("CREATE_CAPA",              "Create corrective/preventive actions"),
    ("UPDATE_CAPA",              "Update CAPAs"),
    ("DELETE_CAPA",              "Delete CAPAs"),
    ("VERIFY_CAPA",              "Verify CAPAs"),
    # Admin
    ("MANAGE_USERS",             "Create and manage users"),
    ("VIEW_AUDIT",               "View activity log"),
]

ROLE_PERMISSIONS = {
    "ADMIN": [p[0] for p in ALL_PERMISSIONS],
    "QA": [
        "READ_REQUIREMENT", "READ_RISK", "READ_DESIGN", "READ_TESTCASE", "READ_DOCUMENT",
        "READ_SOFTWARE_ITEM", "READ_ARCHITECTURE", "READ_SOFTWARE_UNIT", "READ_INTEGRATION_TEST", "READ_SYSTEM_TEST",
        "EXECUTE_TEST", "CREATE_VALIDATION", "UPDATE_VALIDATION",
        "APPROVE_CHANGE_REQUEST", "APPROVE_RELEASE", "PUBLISH_RELEASE",
        "CREATE_RELEASE", "GENERATE_DHF", "VIEW_AUDIT", "UPDATE_DOCUMENT",
        "READ_FEEDBACK", "CREATE_FEEDBACK", "UPDATE_FEEDBACK", "EVALUATE_FEEDBACK",
        "CREATE_CONFIG_ITEM", "UPDATE_CONFIG_ITEM", "DELETE_CONFIG_ITEM",
        "CREATE_BASELINE", "UPDATE_BASELINE", "DELETE_BASELINE", "RELEASE_BASELINE",
        "CREATE_PROBLEM_REPORT", "UPDATE_PROBLEM_REPORT", "DELETE_PROBLEM_REPORT",
        "CREATE_CAPA", "UPDATE_CAPA", "DELETE_CAPA", "VERIFY_CAPA",
    ],
    "QARA": [
        "READ_REQUIREMENT", "CREATE_REQUIREMENT", "UPDATE_REQUIREMENT",
        "READ_RISK", "CREATE_RISK", "UPDATE_RISK",
        "READ_DESIGN", "READ_TESTCASE", "READ_DOCUMENT",
        "READ_SOFTWARE_ITEM", "CREATE_SOFTWARE_ITEM", "UPDATE_SOFTWARE_ITEM",
        "READ_ARCHITECTURE", "CREATE_ARCHITECTURE", "UPDATE_ARCHITECTURE",
        "READ_SOFTWARE_UNIT", "CREATE_SOFTWARE_UNIT", "UPDATE_SOFTWARE_UNIT",
        "READ_INTEGRATION_TEST", "CREATE_INTEGRATION_TEST", "UPDATE_INTEGRATION_TEST",
        "READ_SYSTEM_TEST", "CREATE_SYSTEM_TEST", "UPDATE_SYSTEM_TEST",
        "CREATE_VALIDATION", "UPDATE_VALIDATION",
        "APPROVE_CHANGE_REQUEST", "APPROVE_RELEASE", "PUBLISH_RELEASE",
        "CREATE_RELEASE", "GENERATE_DHF", "VIEW_AUDIT", "UPDATE_DOCUMENT",
        "READ_FEEDBACK", "CREATE_FEEDBACK", "UPDATE_FEEDBACK", "EVALUATE_FEEDBACK", "DELETE_FEEDBACK",
        "CREATE_CONFIG_ITEM", "UPDATE_CONFIG_ITEM", "DELETE_CONFIG_ITEM",
        "CREATE_BASELINE", "UPDATE_BASELINE", "DELETE_BASELINE", "RELEASE_BASELINE",
        "CREATE_PROBLEM_REPORT", "UPDATE_PROBLEM_REPORT", "DELETE_PROBLEM_REPORT",
        "CREATE_CAPA", "UPDATE_CAPA", "DELETE_CAPA", "VERIFY_CAPA",
    ],
    "DEVELOPER": [
        "READ_REQUIREMENT", "CREATE_REQUIREMENT", "UPDATE_REQUIREMENT", "DELETE_REQUIREMENT",
        "READ_RISK", "CREATE_RISK", "UPDATE_RISK",
        "READ_DESIGN", "CREATE_DESIGN", "UPDATE_DESIGN", "DELETE_DESIGN",
        "READ_SOFTWARE_ITEM", "CREATE_SOFTWARE_ITEM", "UPDATE_SOFTWARE_ITEM", "DELETE_SOFTWARE_ITEM",
        "READ_ARCHITECTURE", "CREATE_ARCHITECTURE", "UPDATE_ARCHITECTURE", "DELETE_ARCHITECTURE",
        "READ_SOFTWARE_UNIT", "CREATE_SOFTWARE_UNIT", "UPDATE_SOFTWARE_UNIT", "DELETE_SOFTWARE_UNIT",
        "READ_INTEGRATION_TEST", "CREATE_INTEGRATION_TEST", "UPDATE_INTEGRATION_TEST", "DELETE_INTEGRATION_TEST",
        "READ_SYSTEM_TEST", "CREATE_SYSTEM_TEST", "UPDATE_SYSTEM_TEST", "DELETE_SYSTEM_TEST",
        "READ_TESTCASE", "CREATE_TESTCASE", "EXECUTE_TEST",
        "CREATE_CHANGE_REQUEST", "IMPLEMENT_CHANGE", "CREATE_RELEASE",
        "READ_DOCUMENT",
        "READ_FEEDBACK", "CREATE_FEEDBACK", "UPDATE_FEEDBACK",
        "CREATE_CONFIG_ITEM", "UPDATE_CONFIG_ITEM",
        "CREATE_BASELINE", "UPDATE_BASELINE",
        "CREATE_PROBLEM_REPORT", "UPDATE_PROBLEM_REPORT",
        "CREATE_CAPA", "UPDATE_CAPA",
    ],
    "TESTER": [
        "READ_REQUIREMENT", "READ_RISK", "READ_DESIGN",
        "READ_SOFTWARE_ITEM", "READ_ARCHITECTURE", "READ_SOFTWARE_UNIT", "READ_INTEGRATION_TEST", "READ_SYSTEM_TEST",
        "READ_TESTCASE", "CREATE_TESTCASE", "EXECUTE_TEST",
        "CREATE_VALIDATION", "UPDATE_VALIDATION",
        "READ_DOCUMENT", "VIEW_AUDIT",
        "READ_FEEDBACK",
        "VERIFY_CAPA",
    ],
    "REVIEWER": [
        "READ_REQUIREMENT", "READ_RISK", "READ_DESIGN", "READ_TESTCASE", "READ_DOCUMENT",
        "READ_SOFTWARE_ITEM", "READ_ARCHITECTURE", "READ_SOFTWARE_UNIT", "READ_INTEGRATION_TEST", "READ_SYSTEM_TEST",
        "APPROVE_CHANGE_REQUEST", "APPROVE_RELEASE",
        "CREATE_VALIDATION", "VIEW_AUDIT",
        "READ_FEEDBACK", "EVALUATE_FEEDBACK",
    ],
}

DEFAULT_USERS = [
    {"name": "Admin User",          "email": "admin@medsoft.local",    "password": "Admin@123",    "role": "ADMIN"},
    {"name": "QA Engineer",         "email": "qa@medsoft.local",       "password": "Qa@123456",    "role": "QA"},
    {"name": "QARA Specialist",     "email": "qara@medsoft.local",     "password": "Qara@123456",  "role": "QARA"},
    {"name": "Developer",           "email": "dev@medsoft.local",      "password": "Dev@123456",   "role": "DEVELOPER"},
    {"name": "Testing Engineer",    "email": "tester@medsoft.local",   "password": "Test@123456",  "role": "TESTER"},
    {"name": "Reviewer",            "email": "reviewer@medsoft.local", "password": "Review@123",   "role": "REVIEWER"},
]


async def seed():
    async with AsyncSessionLocal() as db:
        # ── Permissions ──────────────────────────────────────────────────────
        perm_map: dict[str, Permission] = {}
        for name, desc in ALL_PERMISSIONS:
            existing = (await db.execute(select(Permission).where(Permission.name == name))).scalar_one_or_none()
            if not existing:
                p = Permission(id=uuid.uuid4(), name=name, description=desc)
                db.add(p)
                perm_map[name] = p
            else:
                perm_map[name] = existing
        await db.flush()
        print(f"  Permissions: {len(perm_map)} ready")

        # ── Roles ─────────────────────────────────────────────────────────────
        role_map: dict[str, Role] = {}
        for role_name, perm_names in ROLE_PERMISSIONS.items():
            existing = (await db.execute(select(Role).where(Role.name == role_name))).scalar_one_or_none()
            if not existing:
                role = Role(id=uuid.uuid4(), name=role_name, description=f"{role_name} role")
                db.add(role)
                role_map[role_name] = role
            else:
                role_map[role_name] = existing
        await db.flush()

        for role_name, perm_names in ROLE_PERMISSIONS.items():
            role = role_map[role_name]
            for pname in perm_names:
                perm = perm_map[pname]
                exists = (
                    await db.execute(
                        select(RolePermission).where(
                            RolePermission.role_id == role.id,
                            RolePermission.permission_id == perm.id,
                        )
                    )
                ).scalar_one_or_none()
                if not exists:
                    db.add(RolePermission(id=uuid.uuid4(), role_id=role.id, permission_id=perm.id))
        await db.flush()
        print(f"  Roles: {list(role_map.keys())} ready")

        # ── Users ─────────────────────────────────────────────────────────────
        for u in DEFAULT_USERS:
            existing = (await db.execute(select(User).where(User.email == u["email"]))).scalar_one_or_none()
            if not existing:
                role = role_map[u["role"]]
                user = User(
                    id=uuid.uuid4(),
                    name=u["name"],
                    email=u["email"],
                    hashed_password=hash_password(u["password"]),
                    role_id=role.id,
                    is_active=True,
                )
                db.add(user)
                print(f"  Created user: {u['email']} / {u['password']}  [{u['role']}]")
            else:
                print(f"  Skipped existing user: {u['email']}")
        await db.flush()

        # ── Training records for QA (needed to PUBLISH_RELEASE) ───────────────
        qa_user = (await db.execute(select(User).where(User.email == "qa@medsoft.local"))).scalar_one_or_none()
        admin_user = (await db.execute(select(User).where(User.email == "admin@medsoft.local"))).scalar_one_or_none()

        now = datetime.now(timezone.utc)
        for user in [u for u in [qa_user, admin_user] if u]:
            existing_training = (
                await db.execute(select(TrainingRecord).where(TrainingRecord.user_id == user.id).limit(1))
            ).scalar_one_or_none()
            if not existing_training:
                db.add(TrainingRecord(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    training_name="IEC 62304 Software Lifecycle",
                    description="Annual compliance training for medical device software development",
                    completed_at=now - timedelta(days=30),
                    valid_until=now + timedelta(days=335),
                ))
                db.add(TrainingRecord(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    training_name="FDA 21 CFR Part 11 Electronic Records",
                    description="Training on electronic records and signature requirements",
                    completed_at=now - timedelta(days=15),
                    valid_until=now + timedelta(days=350),
                ))
                print(f"  Training records created for {user.email}")

        await db.commit()
        print("\nPhase 4 seed complete.")
        print("\nDefault credentials:")
        print("  admin@medsoft.local    / Admin@123    [ADMIN]")
        print("  qa@medsoft.local       / Qa@123456    [QA]")
        print("  dev@medsoft.local      / Dev@123456   [DEVELOPER]")
        print("  reviewer@medsoft.local / Review@123   [REVIEWER]")


if __name__ == "__main__":
    asyncio.run(seed())
