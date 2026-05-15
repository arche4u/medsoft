# Conventions

Things the codebase does consistently. Following these keeps the diff small and the review fast.

## Backend

### SQLAlchemy

- **Primary keys**: `uuid.UUID` with `default=uuid.uuid4`.
- **Timestamps**: inherit from `TimestampMixin` (gives `created_at`/`updated_at` as `DateTime(timezone=True)`).
- **Status fields are `String`, not `Enum`** — taxonomies must stay open-vocabulary so projects can extend without a schema change. Example: `Feedback.source` is `String(30)` even though we ship 8 default channels.
- **Relationships**: use `lazy="selectin"` for relationships you'll always serialize (avoids N+1 in async).
- **Foreign keys to `projects.id`**: `ondelete="CASCADE"` so deleting a project clears its children. Cross-module FKs that reference an optional entity use `ondelete="SET NULL"`.

### FastAPI routers

```python
router = APIRouter(prefix="/<name>", tags=["<name>"])

@router.get("/", response_model=list[XRead])
async def list_x(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: TokenData = Depends(get_current_user),    # auth only — no specific permission
):
    ...

@router.post("/", response_model=XRead, status_code=201)
async def create_x(
    body: XCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("CREATE_X")),
):
    x = X(**body.model_dump())
    db.add(x)
    await db.flush()
    await audit(db, "X", x.id, AuditAction.CREATE, current_user.user_id, "<detail>")
    await db.commit()
    await db.refresh(x)
    return x
```

### Audit log

Every write (`POST`, `PUT`, `PATCH`, `DELETE`) must call:

```python
await audit(db, "<EntityName>", entity.id, AuditAction.<CREATE|UPDATE|DELETE>, current_user.user_id, "<optional detail>")
```

This row is the **legal record** of who did what when. Skipping it makes the codebase non-compliant — don't skip it even for "minor" updates.

### Permissions

- Naming: `<ACTION>_<ENTITY>` uppercased: `READ_FEEDBACK`, `APPROVE_RELEASE`, `EVALUATE_FEEDBACK`.
- Defined in `backend/seed_phase4.py` `ALL_PERMISSIONS`.
- Mapped to roles in `ROLE_PERMISSIONS`.
- Embedded in the JWT at login — the frontend can read them off `localStorage["medsoft_auth"].permissions` without re-fetching.

### IEC clause comments

Reference clauses in code with the section sign and dotted notation:

```python
# IEC 62304 §6.2.1.2 — document and evaluate
adverse_event: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
```

This is auditable evidence that the field exists *because* of a specific clause.

## Frontend

### Inline styles only

No CSS files, no Tailwind, no styled-components. Style constants live at the bottom of each `page.tsx`:

```typescript
const s: Record<string, React.CSSProperties> = {
  wrap:    { padding: "20px 24px", maxWidth: 1400 },
  card:    { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 6, padding: 12 },
  ...
};
```

Reason: no build-system surface area, no class-name conflicts, no theme-cascade debugging.

### `useActiveProject`

Every page that needs project context uses the hook:

```typescript
const [projectId, setProjectId] = useActiveProject();
```

It reads from `localStorage["medsoft_active_project"]`, listens to the `medsoft:project_changed` custom event, and **verifies the cached project still exists** on mount (auto-clears stale IDs from re-seeds).

### Single API client

```typescript
import { api } from "@/lib/api";

const items = await api.feedback.list(projectId);
```

Never `fetch()` directly from a page. The client centralises:
- JWT injection (`Authorization: Bearer …`)
- 401 → redirect to `/login` + clear `medsoft_auth`
- Form-data vs JSON content-type handling
- Error message extraction

### Route groups for organisation

Parens-wrapped folder names like `(compliance)` and `(maintenance)` are Next.js **route groups** — they are stripped from the URL. Use them to mirror the backend `platform/compliance/<domain>` structure without changing user-facing URLs.

### No hardcoded dynamic data

If a list could be customised per project (categories, sources, severities, statuses, component types, etc.), it lives in the database and is served via `/meta` or `/list` endpoints. The frontend renders whatever it gets — no hardcoded maps of `{"USER": "#1565c0", "SYSTEM": "#6a1b9a", ...}` etc.

If you must fall back when an item isn't in the taxonomy (e.g. a custom feedback channel `STAKEHOLDER_INTERVIEW` not in the built-in 8), show the raw value:

```typescript
const src = meta.sources.find(x => x.name === item.source);
return <Chip color={src?.color ?? "#546e7a"} label={src?.label ?? item.source} />;
```

## Migrations

- Hand-write `upgrade()` and `downgrade()` — autogenerate as a starting point only, never blind-commit.
- Filename: `<rev>_<short_description>.py`, where `<rev>` is a 12-char hex slug.
- `Revises:` chain must be correct or alembic will refuse to upgrade.
- Forward-only migrations (no implementable downgrade) are acceptable for destructive changes; document the reason in the docstring and raise `NotImplementedError` in `downgrade()`.

## Commits

- One IEC clause / one feature per commit when feasible.
- Subject line: name the clause and the deliverable. *"§6.2.1 Feedback Intake + escalation chain"*, not *"misc updates"*.
- Body: bullets per sub-clause covered, plus what was verified.
- **Update docs before committing.** This is a standing rule — see `CLAUDE.md` and the saved feedback memory. Documentation is audit evidence.
- Don't `git push` without the user's explicit approval per push.

## When to use a Plan vs a module

If the concept is a **policy document** (the manufacturer's procedure for X), it's a Plan — extend `compliance/plans/defaults.py`. If the concept is **operational data** that has a workflow/lifecycle (e.g. feedback intake, problem reports), it's a module.

Plans share one schema (`Plan` + `PlanSection`) and one frontend shell (`<PlanShell>`). Modules each get their own model + endpoints + page.
