"""Attachments router: upload, list, download, delete.

Files are stored under `backend/uploads/<project_id>/<attachment_id>__<filename>`
and never committed to git. Content-type whitelist (images + PDF) and a hard
size cap defend against accidental misuse.
"""
from __future__ import annotations
import os
import re
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.audit.service import audit
from app.modules.audit.model import AuditAction
from app.modules.auth.deps import get_current_user
from app.modules.auth.schema import TokenData

from .model import Attachment
from .schema import AttachmentRead, AttachmentUpdate

router = APIRouter(prefix="/attachments", tags=["attachments"])

# ── Limits + whitelist ────────────────────────────────────────────────────────
MAX_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
ALLOWED_CONTENT_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
}

# Storage root — sibling of `app/` so it's outside the package tree.
# Resolved once at import; created lazily on first upload.
_STORAGE_ROOT = Path(__file__).resolve().parents[3] / "uploads"


def _safe_filename(name: str) -> str:
    """Strip directory separators and unsafe characters from a user-supplied
    filename. Keeps the original name visible to users without letting it
    escape the project's upload directory."""
    # Drop any path component, keep just the basename
    base = os.path.basename(name).strip()
    # Collapse whitespace and exotic characters; keep word chars, dot, dash, _
    cleaned = re.sub(r"[^\w.\-]+", "_", base)
    # Avoid leading dot files
    cleaned = cleaned.lstrip(".") or "file"
    return cleaned[:200]


def _project_dir(project_id: uuid.UUID) -> Path:
    d = _STORAGE_ROOT / str(project_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=AttachmentRead, status_code=201)
async def upload_attachment(
    project_id: uuid.UUID = Form(...),
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    description: str | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Upload a single image or PDF and attach it to (entity_type, entity_id)."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            415,
            f"Unsupported file type: {file.content_type or 'unknown'}. "
            f"Allowed: PNG, JPEG, GIF, WebP, SVG, PDF.",
        )

    # Stream + size guard. Read once into memory — the 25 MB cap keeps this
    # safe; if we ever raise the cap, switch to spooled chunks.
    payload = await file.read()
    if len(payload) > MAX_SIZE_BYTES:
        raise HTTPException(
            413,
            f"File is {len(payload):,} bytes; limit is {MAX_SIZE_BYTES:,} bytes (25 MB).",
        )
    if len(payload) == 0:
        raise HTTPException(400, "Empty file rejected.")

    att_id = uuid.uuid4()
    safe_name = _safe_filename(file.filename or "upload")
    target_dir = _project_dir(project_id)
    stored_path = target_dir / f"{att_id}__{safe_name}"
    stored_path.write_bytes(payload)

    row = Attachment(
        id=att_id,
        project_id=project_id,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=safe_name,
        stored_path=str(stored_path),
        content_type=file.content_type,
        size_bytes=len(payload),
        description=description,
        uploaded_by=str(current_user.user_id) if current_user.user_id else None,
    )
    db.add(row)
    await db.flush()
    await audit(
        db, "attachment", row.id, AuditAction.CREATE, current_user.user_id,
        f"{entity_type}:{entity_id} {safe_name} ({len(payload):,}b)",
    )
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/", response_model=List[AttachmentRead])
async def list_attachments(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List every attachment for (entity_type, entity_id). Always returns the
    file metadata only — call /attachments/{id}/download to fetch the bytes."""
    rows = (await db.execute(
        select(Attachment)
        .where(
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
        .order_by(Attachment.created_at.desc())
    )).scalars().all()
    return rows


@router.get("/{att_id}/download")
async def download_attachment(att_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    row = await db.get(Attachment, att_id)
    if not row:
        raise HTTPException(404, "Attachment not found")
    if not Path(row.stored_path).is_file():
        raise HTTPException(410, "Attachment file is no longer on disk")
    return FileResponse(
        path=row.stored_path,
        filename=row.filename,
        media_type=row.content_type,
    )


@router.put("/{att_id}", response_model=AttachmentRead)
async def update_attachment(
    att_id: uuid.UUID,
    body: AttachmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Currently only the description is mutable. The bytes themselves are
    immutable — to replace a file, upload a new one and delete the old."""
    row = await db.get(Attachment, att_id)
    if not row:
        raise HTTPException(404, "Attachment not found")
    if body.description is not None:
        row.description = body.description
    await audit(db, "attachment", row.id, AuditAction.UPDATE, current_user.user_id, "description edit")
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{att_id}", status_code=204)
async def delete_attachment(
    att_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    row = await db.get(Attachment, att_id)
    if not row:
        raise HTTPException(404, "Attachment not found")
    # Best-effort file unlink — if the file's already gone, the row goes
    # anyway so the metadata doesn't dangle.
    try:
        Path(row.stored_path).unlink(missing_ok=True)
    except OSError:
        pass
    await audit(
        db, "attachment", row.id, AuditAction.DELETE, current_user.user_id,
        f"{row.entity_type}:{row.entity_id} {row.filename}",
    )
    await db.delete(row)
    await db.commit()
