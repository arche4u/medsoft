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
from app.modules.roles.model import Role, Permission, RolePermission
from app.modules.users.model import User
from app.modules.training.model import TrainingRecord
from app.modules.esign.model import ElectronicSignature  # noqa: F401 — resolves User relationship
from app.modules.auth.security import hash_password

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
    # Design
    ("READ_DESIGN",              "View design elements"),
    ("CREATE_DESIGN",            "Create design elements"),
    ("UPDATE_DESIGN",            "Update design elements"),
    ("DELETE_DESIGN",            "Delete design elements"),
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
    # Release
    ("CREATE_RELEASE",           "Create release drafts"),
    ("APPROVE_RELEASE",          "Approve releases"),
    ("PUBLISH_RELEASE",          "Publish approved releases"),
    # Documents & DHF
    ("READ_DOCUMENT",            "View documents"),
    ("UPDATE_DOCUMENT",          "Edit document status and notes"),
    ("GENERATE_DHF",             "Generate Design History File"),
    # Admin
    ("MANAGE_USERS",             "Create and manage users"),
    ("VIEW_AUDIT",               "View activity log"),
]

ROLE_PERMISSIONS = {
    "ADMIN": [p[0] for p in ALL_PERMISSIONS],
    "QA": [
        "READ_REQUIREMENT", "READ_RISK", "READ_DESIGN", "READ_TESTCASE", "READ_DOCUMENT",
        "EXECUTE_TEST", "CREATE_VALIDATION", "UPDATE_VALIDATION",
        "APPROVE_CHANGE_REQUEST", "APPROVE_RELEASE", "PUBLISH_RELEASE",
        "CREATE_RELEASE", "GENERATE_DHF", "VIEW_AUDIT", "UPDATE_DOCUMENT",
    ],
    "QARA": [
        "READ_REQUIREMENT", "CREATE_REQUIREMENT", "UPDATE_REQUIREMENT",
        "READ_RISK", "CREATE_RISK", "UPDATE_RISK",
        "READ_DESIGN", "READ_TESTCASE", "READ_DOCUMENT",
        "CREATE_VALIDATION", "UPDATE_VALIDATION",
        "APPROVE_CHANGE_REQUEST", "APPROVE_RELEASE", "PUBLISH_RELEASE",
        "CREATE_RELEASE", "GENERATE_DHF", "VIEW_AUDIT", "UPDATE_DOCUMENT",
    ],
    "DEVELOPER": [
        "READ_REQUIREMENT", "CREATE_REQUIREMENT", "UPDATE_REQUIREMENT", "DELETE_REQUIREMENT",
        "READ_RISK", "CREATE_RISK", "UPDATE_RISK",
        "READ_DESIGN", "CREATE_DESIGN", "UPDATE_DESIGN", "DELETE_DESIGN",
        "READ_TESTCASE", "CREATE_TESTCASE", "EXECUTE_TEST",
        "CREATE_CHANGE_REQUEST", "IMPLEMENT_CHANGE", "CREATE_RELEASE",
        "READ_DOCUMENT",
    ],
    "TESTER": [
        "READ_REQUIREMENT", "READ_RISK", "READ_DESIGN",
        "READ_TESTCASE", "CREATE_TESTCASE", "EXECUTE_TEST",
        "CREATE_VALIDATION", "UPDATE_VALIDATION",
        "READ_DOCUMENT", "VIEW_AUDIT",
    ],
    "REVIEWER": [
        "READ_REQUIREMENT", "READ_RISK", "READ_DESIGN", "READ_TESTCASE", "READ_DOCUMENT",
        "APPROVE_CHANGE_REQUEST", "APPROVE_RELEASE",
        "CREATE_VALIDATION", "VIEW_AUDIT",
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
