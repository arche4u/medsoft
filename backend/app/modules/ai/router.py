import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.modules.documents.model import Document
from app.modules.requirements.model import Requirement, RequirementCategory
from app.modules.knowledge.model import KnowledgeEntry

router = APIRouter(prefix="/ai", tags=["ai"])


class GenerateRequest(BaseModel):
    project_id: uuid.UUID
    product_description: str
    focus_area: str | None = None


class CategoryMeta(BaseModel):
    name: str
    label: str
    sort_order: int
    parent_name: str | None = None


class GeneratedRequirement(BaseModel):
    type: str        # matches a RequirementCategory.name for this project
    title: str
    description: str
    rationale: str   # IEC 62304 / standard clause reference


class GenerateResponse(BaseModel):
    requirements: list[GeneratedRequirement]
    categories: list[CategoryMeta]   # echo back so frontend can use colors/labels
    tokens_used: int
    model: str


SYSTEM_PROMPT = """You are a medical device requirements engineer with deep expertise in IEC 62304,
ISO 13485, ISO 14971, IEC 62366, and FDA/MDR regulatory frameworks.

Your job is to generate a comprehensive, structured set of requirements for a medical device or system.

Rules:
1. Use ONLY the requirement categories provided — do not invent new ones
2. Every requirement must be atomic, testable, and unambiguous
3. Higher-level categories (lower sort_order) should describe WHAT is needed; lower-level ones HOW
4. For each requirement include a rationale citing the relevant standard/clause
5. Distribute requirements sensibly across all provided categories
6. For safety-critical systems always consider: safety interlocks, data integrity, auditability, error handling

Return ONLY valid JSON — no markdown, no commentary:
{
  "requirements": [
    {
      "type": "<category name exactly as given>",
      "title": "Short imperative title",
      "description": "Full testable requirement statement",
      "rationale": "Standard clause and reason (e.g. IEC 62304 §5.2, ISO 14971 §4)"
    }
  ]
}"""


def _build_prompt(
    description: str,
    focus: str | None,
    categories: list[RequirementCategory],
    sop_context: str,
    existing_count: int,
) -> str:
    sorted_cats = sorted(categories, key=lambda c: c.sort_order)
    cat_lines = "\n".join(
        f"  - name: \"{c.name}\" | label: \"{c.label}\" | sort_order: {c.sort_order}"
        + (f" | parent: \"{next((p.name for p in sorted_cats if p.id == c.parent_id), None)}\"" if c.parent_id else "")
        for c in sorted_cats
    )

    per_cat = max(3, min(8, 40 // max(len(categories), 1)))

    focus_line = f"\nPay special attention to: {focus}" if focus else ""
    existing_line = f"\nThe project already has {existing_count} requirements — generate complementary ones, avoid duplication." if existing_count else ""
    sop_section = f"\n\n--- PROJECT SOP / REFERENCE CONTEXT ---\n{sop_context[:5000]}\n--- END CONTEXT ---" if sop_context else ""

    return f"""Generate requirements for the following medical device / system:

DESCRIPTION:
{description}{focus_line}{existing_line}

REQUIREMENT CATEGORIES FOR THIS PROJECT (use these type names exactly):
{cat_lines}

Generate approximately {per_cat} requirements per category, covering the full scope of the system.
Ensure traceability: lower-level requirements should derive from higher-level ones.{sop_section}"""


async def _get_context(project_id: uuid.UUID, db: AsyncSession) -> str:
    """Build AI context from: project knowledge entries → global standards → project documents."""
    parts: list[str] = []

    # Project-specific knowledge entries (highest priority)
    proj_entries = (
        await db.execute(
            select(KnowledgeEntry).where(
                KnowledgeEntry.project_id == project_id,
                KnowledgeEntry.is_global == False,  # noqa: E712
            ).order_by(KnowledgeEntry.sort_order).limit(10)
        )
    ).scalars().all()
    for e in proj_entries:
        text = e.content or e.summary or ""
        if text:
            parts.append(f"[Project Rule — {e.category}] {e.title}:\n{text[:600]}")

    # Global knowledge base (concise summaries)
    global_entries = (
        await db.execute(
            select(KnowledgeEntry).where(
                KnowledgeEntry.is_global == True,  # noqa: E712
            ).order_by(KnowledgeEntry.sort_order).limit(15)
        )
    ).scalars().all()
    for e in global_entries:
        if e.summary:
            ref = f"{e.standard} {e.clause_ref}" if e.clause_ref else (e.standard or "")
            parts.append(f"[{ref}] {e.title}: {e.summary}")

    # Project SOP / Plans / Standards documents
    docs = (
        await db.execute(
            select(Document).where(
                Document.project_id == project_id,
                Document.category.in_(["SOP", "PLANS", "STANDARDS"]),
                Document.content.isnot(None),
            ).limit(4)
        )
    ).scalars().all()
    for doc in docs:
        if doc.content:
            parts.append(f"[{doc.doc_type}] {doc.title}:\n{doc.content[:800]}")

    return "\n\n".join(parts)


@router.post("/generate-requirements", response_model=GenerateResponse)
async def generate_requirements(
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key or api_key.startswith("sk-ant-REPLACE"):
        raise HTTPException(503, "Anthropic API key not configured")

    try:
        import anthropic
    except ImportError:
        raise HTTPException(503, "anthropic package not installed")

    # Load project categories
    categories = (
        await db.execute(
            select(RequirementCategory)
            .where(RequirementCategory.project_id == body.project_id)
            .order_by(RequirementCategory.sort_order)
        )
    ).scalars().all()

    if not categories:
        raise HTTPException(422, "No requirement categories found for this project. Create categories first.")

    # Load knowledge context + existing count
    sop_context = await _get_context(body.project_id, db)
    existing = (
        await db.execute(
            select(Requirement).where(Requirement.project_id == body.project_id)
        )
    ).scalars().all()

    prompt = _build_prompt(body.product_description, body.focus_area, list(categories), sop_context, len(existing))

    client = anthropic.Anthropic(api_key=api_key)
    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        raise HTTPException(502, f"AI generation failed: {str(e)}")

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data = json.loads(raw)
        valid_names = {c.name for c in categories}
        reqs = []
        for r in data.get("requirements", []):
            # Normalise type to uppercase and validate against project categories
            r["type"] = r["type"].strip().upper()
            if r["type"] not in valid_names:
                # Try case-insensitive match
                match = next((n for n in valid_names if n.upper() == r["type"]), None)
                if match:
                    r["type"] = match
                else:
                    continue  # skip unknown types silently
            reqs.append(GeneratedRequirement(**r))
    except Exception:
        raise HTTPException(502, f"AI returned malformed JSON: {raw[:300]}")

    cat_meta = [
        CategoryMeta(
            name=c.name,
            label=c.label,
            sort_order=c.sort_order,
            parent_name=next((p.name for p in categories if p.id == c.parent_id), None),
        )
        for c in categories
    ]

    return GenerateResponse(
        requirements=reqs,
        categories=cat_meta,
        tokens_used=message.usage.input_tokens + message.usage.output_tokens,
        model=message.model,
    )
