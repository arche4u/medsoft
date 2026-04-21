import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from .model import Document
from .schema import DocumentCreate, DocumentRead, DocumentUpdate

router = APIRouter(prefix="/documents", tags=["documents"])

# Canonical document registry — seeded on first project access
DOCUMENT_REGISTRY = [
    # Plans
    {"doc_type": "SDP",   "category": "PLANS",       "title": "Software Development Plan"},
    {"doc_type": "SMP",   "category": "PLANS",       "title": "Software Maintenance Plan"},
    {"doc_type": "SPRP",  "category": "PLANS",       "title": "Software Problem Resolution Plan"},
    {"doc_type": "SCP",   "category": "PLANS",       "title": "Software Configuration Plan"},
    {"doc_type": "SVP",   "category": "PLANS",       "title": "Software Verification Plan"},
    {"doc_type": "SBRP",  "category": "PLANS",       "title": "Software Build and Release Plan"},
    # Technical Documents
    {"doc_type": "SRS",   "category": "TECHNICAL",   "title": "Software Requirements Specification"},
    {"doc_type": "SADS",  "category": "TECHNICAL",   "title": "Software Architecture Design Specification"},
    {"doc_type": "SDDS",  "category": "TECHNICAL",   "title": "Software Detailed Design Specification"},
    {"doc_type": "SVPROT","category": "TECHNICAL",   "title": "Software Verification Protocol"},
    {"doc_type": "SVREP", "category": "TECHNICAL",   "title": "Software Verification Report"},
    # Development Documents
    {"doc_type": "SBD",   "category": "DEVELOPMENT", "title": "Software Build Document"},
    {"doc_type": "SII",   "category": "DEVELOPMENT", "title": "Software Installation Instructions"},
    {"doc_type": "CG",    "category": "DEVELOPMENT", "title": "Coding Guidelines"},
    {"doc_type": "SUTP",  "category": "DEVELOPMENT", "title": "Software Unit Test Protocol"},
    {"doc_type": "SUTR",  "category": "DEVELOPMENT", "title": "Software Unit Test Report"},
    {"doc_type": "SITP",  "category": "DEVELOPMENT", "title": "Software Integration Test Protocol"},
    {"doc_type": "SITR",  "category": "DEVELOPMENT", "title": "Software Integration Test Report"},
    {"doc_type": "SOUP",  "category": "DEVELOPMENT", "title": "SOUP List"},
    {"doc_type": "CRR",   "category": "DEVELOPMENT", "title": "Code Review Report"},
    {"doc_type": "VDD",   "category": "DEVELOPMENT", "title": "Version Description Document"},
    {"doc_type": "RHL",   "category": "DEVELOPMENT", "title": "Revision History Log"},
    {"doc_type": "UAL",   "category": "DEVELOPMENT", "title": "Unresolved Anomaly List"},
    {"doc_type": "TM",    "category": "DEVELOPMENT", "title": "Traceability Matrix"},
]


async def _ensure_documents(db: AsyncSession, project_id: uuid.UUID) -> None:
    """Seed all canonical document records for a project if not present yet."""
    existing = (
        await db.execute(select(Document.doc_type).where(Document.project_id == project_id))
    ).scalars().all()
    existing_types = set(existing)
    for entry in DOCUMENT_REGISTRY:
        if entry["doc_type"] not in existing_types:
            db.add(Document(
                project_id=project_id,
                doc_type=entry["doc_type"],
                category=entry["category"],
                title=entry["title"],
                status="NOT_STARTED",
            ))


@router.get("/", response_model=list[DocumentRead])
async def list_documents(
    project_id: uuid.UUID,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_documents(db, project_id)
    await db.commit()
    q = select(Document).where(Document.project_id == project_id)
    if category:
        q = q.where(Document.category == category.upper())
    q = q.order_by(Document.category, Document.doc_type)
    return (await db.execute(q)).scalars().all()


@router.get("/{doc_id}", response_model=DocumentRead)
async def get_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@router.post("/", response_model=DocumentRead, status_code=201)
async def create_document(body: DocumentCreate, db: AsyncSession = Depends(get_db)):
    doc = Document(**body.model_dump())
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.put("/{doc_id}", response_model=DocumentRead)
async def update_document(doc_id: uuid.UUID, body: DocumentUpdate, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    await db.delete(doc)
    await db.commit()
