"""IEC 81001-5-1 SBOM export — derived view over the §8.2.2 SOUP register.

The single source of truth is `cm_config_items` rows with `item_type=SOUP`.
This module emits a CycloneDX 1.5 JSON document (the format FDA / EU MDR
guidance now references most often) so the SBOM can be attached to a
release, shared with regulators, or ingested by downstream vuln scanners.

No new models — the SBOM is a snapshot computed on demand.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.modules.platform.audit.service import audit
from app.modules.platform.audit.model import AuditAction
from app.modules.platform.auth.deps import require_permission
from app.modules.platform.auth.schema import TokenData
from app.modules.platform.projects.model import Project
from app.modules.compliance.config.config_mgmt.model import CMConfigItem
from app.modules.compliance.cybersecurity.vulnerabilities.model import VulnerabilityReport

router = APIRouter(prefix="/sbom", tags=["cybersecurity"])


def _component_dict(item: CMConfigItem, vulns_for_item: list[VulnerabilityReport]) -> dict:
    """Map a SOUP CMConfigItem → one CycloneDX `components[]` entry."""
    bom_ref = f"soup:{item.id}"
    comp: dict = {
        "type": "library",
        "bom-ref": bom_ref,
        "name": item.name,
        "version": item.version,
    }
    if item.description:
        comp["description"] = item.description
    if item.reference_id:
        # CycloneDX `purl` (package URL) — best fit for the free-text
        # reference_id field on CMConfigItem (e.g., "pkg:npm/lodash@4.17.21").
        comp["purl"] = item.reference_id
    # Each vulnerability scoped to this SOUP becomes a CycloneDX
    # `vulnerabilities[]` entry referencing this bom-ref.
    return comp


def _vuln_dict(v: VulnerabilityReport, affected_bom_refs: list[str]) -> dict:
    """Map a VulnerabilityReport → one CycloneDX `vulnerabilities[]` entry."""
    entry: dict = {
        "bom-ref": f"vuln:{v.id}",
        "id": v.cve_id or f"INTERNAL-{v.id}",
        "description": v.description or v.title,
        "affects": [{"ref": ref} for ref in affected_bom_refs],
    }
    if v.cvss_score is not None:
        entry["ratings"] = [{
            "method": "CVSSv31",
            "score": v.cvss_score,
            "severity": v.severity_band.lower(),
            **({"vector": v.cvss_vector} if v.cvss_vector else {}),
        }]
    # Map our internal status to the closest CycloneDX analysis state.
    state_map = {
        "NEW": "in_triage",
        "TRIAGED": "in_triage",
        "MITIGATED": "resolved_with_pedigree",
        "RESOLVED": "resolved",
        "FALSE_POSITIVE": "false_positive",
    }
    entry["analysis"] = {"state": state_map.get(v.status, "in_triage")}
    return entry


@router.get("/{project_id}")
async def export_sbom(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("READ_CONFIG_ITEM")),
):
    """Return a CycloneDX 1.5 SBOM for the project's SOUP register.

    Includes any open VulnerabilityReports (not in RESOLVED / FALSE_POSITIVE)
    that have an `affected_soup_id` pointing at a SOUP entry. Auditors can
    open this JSON in any CycloneDX-aware tool.
    """
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    soup_items = (await db.execute(
        select(CMConfigItem).where(
            CMConfigItem.project_id == project_id,
            CMConfigItem.item_type == "SOUP",
        ).order_by(CMConfigItem.name)
    )).scalars().all()

    vulns = (await db.execute(
        select(VulnerabilityReport).where(
            VulnerabilityReport.project_id == project_id,
            VulnerabilityReport.status.not_in(["FALSE_POSITIVE"]),
        )
    )).scalars().all()

    # Index vulns by affected SOUP for the affects[] back-references.
    soup_index = {str(item.id): f"soup:{item.id}" for item in soup_items}
    vuln_entries = []
    for v in vulns:
        affected: list[str] = []
        if v.affected_soup_id and str(v.affected_soup_id) in soup_index:
            affected.append(soup_index[str(v.affected_soup_id)])
        # Skip vulns we can't tie to anything in this SBOM.
        if affected:
            vuln_entries.append(_vuln_dict(v, affected))

    now = datetime.now(timezone.utc)
    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "version": 1,
        "metadata": {
            "timestamp": now.isoformat(),
            "tools": [{"vendor": "MedSoft", "name": "MedSoft Compliance Platform", "version": "0.8"}],
            "component": {
                "type": "application",
                "bom-ref": f"project:{project.id}",
                "name": project.name,
                "version": "current",
            },
        },
        "components": [_component_dict(it, vulns) for it in soup_items],
        "vulnerabilities": vuln_entries,
    }

    await audit(db, "Project", project.id, AuditAction.READ, current_user.user_id,
                f"SBOM export ({len(soup_items)} components, {len(vuln_entries)} vulnerabilities)")
    await db.commit()

    import json
    return Response(
        content=json.dumps(sbom, indent=2),
        media_type="application/vnd.cyclonedx+json",
        headers={
            "Content-Disposition": f'attachment; filename="sbom-{project.name.replace(" ", "_")}-{now.strftime("%Y%m%d")}.json"',
        },
    )
