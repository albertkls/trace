from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
import tomllib


def _source_version() -> str | None:
    pyproject = Path(__file__).resolve().parents[2] / "pyproject.toml"
    if not pyproject.exists():
        return None
    try:
        data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    except Exception:
        return None
    project = data.get("project")
    if not isinstance(project, dict):
        return None
    value = project.get("version")
    return value if isinstance(value, str) else None


try:
    __version__ = _source_version() or version("trace-api")
except PackageNotFoundError:
    __version__ = "1.9.1"
