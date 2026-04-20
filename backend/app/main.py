from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
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

app = FastAPI(title="MedSoft Compliance Platform", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in [
    projects_router, requirements_router, testcases_router,
    tracelinks_router, risks_router, traceability_router,
    design_router, verification_router, validation_router,
    audit_router, impact_router,
]:
    app.include_router(r, prefix=settings.API_PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.3.0"}
