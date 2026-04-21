from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.modules.auth.deps import get_current_user

# Public routers (no auth required)
from app.modules.auth.router import router as auth_router

# Phase 0-2 routers
from app.modules.projects.router import router as projects_router
from app.modules.requirements.router import router as requirements_router
from app.modules.testcases.router import router as testcases_router
from app.modules.tracelinks.router import router as tracelinks_router
from app.modules.risks.router import router as risks_router
from app.modules.traceability.router import router as traceability_router
from app.modules.design.router import router as design_router
from app.modules.verification.router import router as verification_router
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
    projects_router, requirements_router, testcases_router,
    tracelinks_router, risks_router, traceability_router,
    design_router, verification_router, validation_router,
    audit_router, impact_router,
    change_control_router, approval_router, release_router, dhf_router,
    roles_router, users_router, esign_router, training_router,
    documents_router,
]:
    app.include_router(router, prefix=settings.API_PREFIX, dependencies=_auth)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.5.0"}
