"""Deprecated desktop UI entrypoint.

Presto now uses Web/Electron as the only frontend.
"""

from __future__ import annotations


def main() -> int:
    print("Python UI entry has been removed.")
    print("Use Web/Electron frontend instead:")
    print("  npm --prefix web install")
    print("  npm --prefix web run dev")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
