"""
main.py - VerifyVote FastAPI Application Entry Point
All crypto logic is in app/crypto/ — imported via api routers only.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.core.database import engine, Base
from app.api import api_router

import app.models.user      # noqa
import app.models.election  # noqa


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[OK] VerifyVote API started - all tables ready")
    yield


app = FastAPI(
    title="VerifyVote API",
    description="Secure Electronic Voting System",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return validation errors as a clean readable string instead of nested objects."""
    messages = []
    for error in exc.errors():
        field = " -> ".join(str(l) for l in error["loc"] if l != "body")
        msg = error["msg"]
        messages.append(f"{field}: {msg}" if field else msg)
    return JSONResponse(
        status_code=422,
        content={"detail": " | ".join(messages)}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    return {"service": "VerifyVote API", "version": "1.0.0", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
