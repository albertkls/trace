from __future__ import annotations

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import ensure_schema
from .seed import seed
from .routers import captures, llm, notes, reports, search, threads, todos


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    seed()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Trace API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "service": "trace-api"}

    app.include_router(threads.router, prefix="/api")
    app.include_router(reports.router, prefix="/api")
    app.include_router(captures.router, prefix="/api")
    app.include_router(todos.router, prefix="/api")
    app.include_router(notes.router, prefix="/api")
    app.include_router(llm.router, prefix="/api")
    app.include_router(search.router, prefix="/api")
    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("trace_api.main:app", host="127.0.0.1", port=8787, reload=True)


if __name__ == "__main__":
    run()
