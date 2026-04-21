from __future__ import annotations

import argparse
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings, reset_settings_cache
from .db import ensure_schema
from .routers import captures, llm, notes, projects, reports, search, threads, todos
from .web import mount_frontend


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Trace API", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        return {
            "status": "ok",
            "service": "trace-api",
            "version": __version__,
            "mode": settings.mode,
        }

    app.include_router(threads.router, prefix="/api")
    app.include_router(projects.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    app.include_router(captures.router, prefix="/api")
    app.include_router(todos.router, prefix="/api")
    app.include_router(notes.router, prefix="/api")
    app.include_router(llm.router, prefix="/api")
    app.include_router(search.router, prefix="/api")
    mount_frontend(app)
    return app


app = create_app()


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Trace API / release runtime")
    parser.add_argument("--host", default=settings.host, help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=settings.port, help="Bind port (default: 8787)")
    parser.add_argument(
        "--reload",
        action="store_true",
        default=settings.reload,
        help="Enable auto reload for development",
    )
    parser.add_argument(
        "--frontend-dist",
        help="Serve the built frontend from this directory instead of auto-detecting it",
    )
    parser.add_argument(
        "--mode",
        choices=["development", "desktop", "production"],
        help="Override TRACE_RUNTIME_MODE for this launch",
    )
    parser.add_argument(
        "--seed-demo",
        action="store_true",
        default=settings.seed_demo,
        help="Reserved flag; demo seed data has been removed",
    )
    return parser.parse_args(argv)


def run(argv: list[str] | None = None) -> None:
    import uvicorn

    args = _parse_args(argv)
    os.environ["TRACE_HOST"] = args.host
    os.environ["TRACE_PORT"] = str(args.port)
    os.environ["TRACE_RELOAD"] = "1" if args.reload else "0"
    os.environ["TRACE_SEED_DEMO"] = "1" if args.seed_demo else "0"
    if args.mode:
        os.environ["TRACE_RUNTIME_MODE"] = args.mode
    if args.frontend_dist:
        os.environ["TRACE_FRONTEND_DIST"] = args.frontend_dist

    reset_settings_cache()
    if args.reload:
        uvicorn.run(
            "trace_api.main:create_app",
            factory=True,
            host=args.host,
            port=args.port,
            reload=True,
        )
        return

    uvicorn.run(
        create_app(),
        host=args.host,
        port=args.port,
        reload=False,
        server_header=False,
        log_level=get_settings().log_level,
    )


if __name__ == "__main__":
    run()
