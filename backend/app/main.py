from pathlib import Path
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.modules.platform.auth.deps import get_current_user

# Public routers (no auth required)
from app.modules.platform.auth.router import router as auth_router

# Phase 0-2 routers
from app.modules.platform.projects.router import router as projects_router
from app.modules.compliance.dev.requirements.router import router as requirements_router
from app.modules.compliance.dev.requirements.baseline_router import router as requirements_baseline_router
from app.modules.compliance.dev.requirements.category_baseline_router import router as requirements_category_baseline_router
from app.modules.compliance.risk.risks.router import router as risks_router
from app.modules.compliance.dev.traceability.router import router as traceability_router
from app.modules.compliance.dev.design.router import router as design_router
from app.modules.compliance.dev.validation.router import router as validation_router
from app.modules.platform.audit.router import router as audit_router
from app.modules.compliance.dev.impact.router import router as impact_router

# Phase 3 routers
from app.modules.compliance.change_control.router import router as change_control_router
from app.modules.platform.approval.router import router as approval_router
from app.modules.compliance.release.router import router as release_router
from app.modules.compliance.dhf.router import router as dhf_router

# Phase 4 routers
from app.modules.platform.roles.router import router as roles_router
from app.modules.platform.users.router import router as users_router
from app.modules.platform.esign.router import router as esign_router
from app.modules.platform.training.router import router as training_router
from app.modules.platform.documents.router import router as documents_router
from app.modules.platform.ai.router import router as ai_router
from app.modules.platform.knowledge.router import router as knowledge_router
from app.modules.compliance.dev.software_items.router import router as software_items_router
from app.modules.compliance.dev.sdp.router import router as sdp_router
from app.modules.compliance.dev.architecture.router import router as architecture_router
from app.modules.compliance.dev.architecture.baseline_router import router as architecture_baseline_router
from app.modules.platform.attachments.router import router as attachments_router
from app.modules.compliance.dev.units.router import router as units_router
from app.modules.compliance.dev.integration_tests.router import router as integration_tests_router
from app.modules.compliance.dev.system_testing.router import router as system_testing_router
from app.modules.compliance.config.config_mgmt.router import router as config_mgmt_router
from app.modules.compliance.problems.capa.router import router as capa_router
from app.modules.compliance.plans.router import router as plans_router
from app.modules.compliance.maintenance.feedback.router import router as feedback_router
from app.modules.compliance.cybersecurity.threat_model.router import router as threat_model_router
from app.modules.compliance.cybersecurity.vulnerabilities.router import router as vulnerabilities_router

app = FastAPI(title="MedSoft Compliance Platform", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public — no auth
app.include_router(auth_router, prefix=settings.API_PREFIX)

# Protected — all require a valid JWT
_auth = [Depends(get_current_user)]

for router in [
    projects_router, requirements_router,
    requirements_baseline_router, requirements_category_baseline_router,
    risks_router, traceability_router,
    design_router, validation_router,
    audit_router, impact_router,
    change_control_router, approval_router, release_router, dhf_router,
    roles_router, users_router, esign_router, training_router,
    documents_router, ai_router, knowledge_router,
    software_items_router,
    sdp_router,
    architecture_router,
    architecture_baseline_router,
    attachments_router,
    units_router,
    integration_tests_router,
    system_testing_router,
    config_mgmt_router,
    capa_router,
    plans_router,
    feedback_router,
    threat_model_router,
    vulnerabilities_router,
]:
    app.include_router(router, prefix=settings.API_PREFIX, dependencies=_auth)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.5.0"}


# ── Documentation sites ─────────────────────────────────────────────────────
# Two mkdocs builds, two mount paths:
#
#   /manual        → site/        (full docs — User Guide + Developer Guide)
#                                  shown to ADMIN / DEVELOPER roles
#   /manual-user   → site-user/   (User Guide ONLY — Developer Guide excluded
#                                  from build per mkdocs-user.yml)
#                                  shown to QA / QARA / TESTER / REVIEWER / etc.
#
# Build both with:   mkdocs build && mkdocs build -f mkdocs-user.yml
# Not /docs — that's already FastAPI's Swagger UI.

_REPO_ROOT = Path(__file__).resolve().parents[2]
_MANUAL_FULL = _REPO_ROOT / "site"
_MANUAL_USER = _REPO_ROOT / "site-user"

if _MANUAL_FULL.is_dir():
    app.mount("/manual", StaticFiles(directory=_MANUAL_FULL, html=True), name="manual")

if _MANUAL_USER.is_dir():
    app.mount("/manual-user", StaticFiles(directory=_MANUAL_USER, html=True), name="manual_user")

if not _MANUAL_FULL.is_dir() and not _MANUAL_USER.is_dir():
    @app.get("/manual-not-built")
    async def manual_not_built_page():
        return {
            "status": "not_built",
            "message": "The user manual hasn't been built yet. Run "
                       "`mkdocs build && mkdocs build -f mkdocs-user.yml` in the repo root.",
        }
