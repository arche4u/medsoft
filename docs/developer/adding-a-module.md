# Adding a new module

A checklist for landing a new feature module without breaking the build, the audit trail, or the IEC clause mapping.

## 1. Decide where it belongs

| If it is… | Goes under… |
|---|---|
| Infrastructure (auth, files, AI, knowledge base) | `backend/app/modules/platform/<name>/` |
| A regulated IEC 62304 §5 development activity | `backend/app/modules/compliance/dev/<name>/` |
| A regulated §6 / §7 / §8 / §9 activity | `backend/app/modules/compliance/<section>/<name>/` |
| A cross-clause release/change/DHF/plans concern | `backend/app/modules/compliance/<name>/` (direct child) |
| Cybersecurity (IEC 81001-5-1) | `backend/app/modules/compliance/cybersecurity/<name>/` |

## 2. Backend skeleton

Create four files in `backend/app/modules/<path>/<name>/`:

```
__init__.py    empty marker
model.py       SQLAlchemy models, IEC clause references in docstring
schema.py      Pydantic Create/Update/Read/etc. + any taxonomy dicts
router.py      FastAPI APIRouter with prefix=/<name>, tags=["<name>"]
```

**Model conventions:**
- Primary keys are `uuid.UUID` with `default=uuid.uuid4`.
- Timestamps via `TimestampMixin` (gives `created_at` + `updated_at`).
- Status fields use `Mapped[str]` (NOT `Enum`) so taxonomy stays open-vocabulary.
- FK to `projects.id` has `ondelete="CASCADE"` (rows go away when project is deleted).
- Cross-module FKs use `ondelete="SET NULL"` when the linked entity is optional.

**Router conventions:**
- Read endpoints: `Depends(get_current_user)` is enough.
- Write endpoints: `Depends(require_permission("<NAME>_<ACTION>"))`.
- Every write calls `await audit(db, "<EntityName>", entity.id, AuditAction.CREATE|UPDATE|DELETE, current_user.user_id, "<detail>")`.
- Return `from_attributes`-style Pydantic schemas via `response_model=`.

## 3. Register the module

Two registration points + one migration:

```python
# backend/app/main.py
from app.modules.compliance.<section>.<name>.router import router as <name>_router
# add <name>_router to the protected `for router in [...]` loop.
```

```python
# backend/alembic/env.py
import app.modules.compliance.<section>.<name>.model  # noqa: F401
```

```bash
# backend/
cd backend && source .venv/bin/activate
alembic revision -m "describe change"     # or hand-author for clarity
# edit the generated file: upgrade() / downgrade()
alembic upgrade head
```

## 4. Permissions

```python
# backend/seed_phase4.py
ALL_PERMISSIONS = [
    ...
    ("READ_<NAME>",    "View <name>"),
    ("CREATE_<NAME>",  "Create <name>"),
    ("UPDATE_<NAME>",  "Update <name>"),
    ("DELETE_<NAME>",  "Delete <name>"),
]

ROLE_PERMISSIONS = {
    "ADMIN":    [...],   # auto-includes via list comprehension
    "QA":       [..., "READ_<NAME>", "UPDATE_<NAME>"],
    "DEVELOPER":[..., "READ_<NAME>", "CREATE_<NAME>", "UPDATE_<NAME>"],
    ...
}
```

Then re-run `python seed_phase4.py` (or full `python seed_all.py`) to wire the permissions.

## 5. Frontend page

```
frontend/src/app/(<section>)/<name>/page.tsx
```

Pattern:
- `"use client";` at the top.
- Read the active project from `useActiveProject()`.
- All API calls via `api.<name>.*` (defined in `frontend/src/lib/api.ts`).
- Inline styles only — no CSS files, no Tailwind.
- Pull taxonomies from `/api/v1/<name>/meta` instead of hardcoding enums.

## 6. API client method

```typescript
// frontend/src/lib/api.ts
export type <Name> = { id: string; project_id: string; ...; created_at: string };

export const api = {
  ...,
  <name>: {
    meta:   () => req<<Name>Meta>("/<name>/meta"),
    list:   (project_id: string) => req<<Name>[]>(`/<name>/?project_id=${project_id}`),
    get:    (id: string) => req<<Name>>(`/<name>/${id}`),
    create: (d: <Name>Create) => req<<Name>>("/<name>/", { method: "POST", body: JSON.stringify(d) }),
    update: (id: string, d: <Name>Update) => req<<Name>>(`/<name>/${id}`, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: string) => req<void>(`/<name>/${id}`, { method: "DELETE" }),
  },
};
```

## 7. Sidebar entry

`frontend/src/app/NavSidebar.tsx` is the source of truth for navigation. Add the entry **at the correct ascending-clause position** (§6 sits between §5.7 and §7, etc.). Cybersecurity gets its own top-level group, not nested.

## 8. Seed data

Add a seed for the new module so demos and tests have realistic data. Either:
- Extend `seed_architecture.py` (if §4.3–§5.8)
- Add a new `seed_section<N>.py` script and append it to `seed_all.py`'s `STEPS` list

## 9. Documentation

**Before the commit:**
- Add a developer-side reference to `docs/developer/` (data model + endpoints + extension points).
- Add a user-side workflow guide to `docs/user/` written for QA / RA / clinical engineers.
- Update `docs/developer/iec-62304-mapping.md` if the new module satisfies a clause.
- Update `mkdocs.yml`'s `nav` so the new pages appear in the navigation.
- Update `CLAUDE.md`'s Repository Layout + Data Model + API Structure + Phases tables.

## 10. Verify before commit

```bash
# Backend
cd backend && source .venv/bin/activate
python -c "from app.main import app; print(len(app.routes))"   # imports cleanly
alembic upgrade head                                            # migration applies
python seed_all.py                                              # full seed succeeds

# Frontend
cd frontend
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npx tsc --noEmit
PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH npm run build

# Docs
mkdocs build                                                    # site builds clean
```

## 11. Commit

Write a commit message naming the IEC clause(s) the work satisfies. Don't push until the user approves (see the "Ask before commit/push" rule in `CLAUDE.md`).
