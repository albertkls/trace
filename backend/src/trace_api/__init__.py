from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("trace-api")
except PackageNotFoundError:
    __version__ = "1.5.1"
