from fastapi import APIRouter
from .auth import router as auth_router
from .voter import router as voter_router
from .officer import router as officer_router
from .admin import router as admin_router
from .public import router as public_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(voter_router)
api_router.include_router(officer_router)
api_router.include_router(admin_router)
api_router.include_router(public_router)
