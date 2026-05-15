from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.modules.auth.deps import get_current_user

# Public routers (no auth required)
from app.modules.auth.router import router as auth_router

# Phase 0-2 routers
from app.modules.projects.router import router as projects_router
from app.modules.requirements.router import router as requirements_router
from app.modules.requirements.baseline_router import router as requirements_baseline_router
from app.modules.requirements.category_baseline_router import router as requirements_category_baseline_router
from app.modules.risks.router import router as risks_router
from app.modules.traceability.router import router as traceability_router
from app.modules.design.router import router as design_router
from app.modules.validation.router import router as validation_router
from app.modules.audit.router import router as audit_router
from app.modules.impact.router import router as impact_router

# Phase 3 routers
from app.modules.change_control.router import router as change_control_router
from app.modules.approval.router import router as approval_router
from app.modules.release.router import router as release_router
from app.modules.dhf.router import router as dhf_router

# Phase 4 routers
from app.modules.roles.router import router as roles_router
from app.modules.users.router import router as users_router
from app.modules.esign.router import router as esign_router
from app.modules.training.router import router as training_router
from app.modules.documents.router import router as documents_router
from app.modules.ai.router import router as ai_router
from app.modules.knowledge.router import router as knowledge_router
from app.modules.software_items.router import router as software_items_router
from app.modules.sdp.router import router as sdp_router
from app.modules.architecture.router import router as architecture_router
from app.modules.architecture.baseline_router import router as architecture_baseline_router
from app.modules.attachments.router import router as attachments_router
from app.modules.units.router import router as units_router
from app.modules.integration_tests.router import router as integration_tests_router
from app.modules.system_testing.router import router as system_testing_router
from app.modules.config_mgmt.router import router as config_mgmt_router
from app.modules.capa.router import router as capa_router
from app.modules.plans.router import router as plans_router

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
]:
    app.include_router(router, prefix=settings.API_PREFIX, dependencies=_auth)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.5.0"}
