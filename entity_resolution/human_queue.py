from __future__ import annotations

from typing import Any


def queue_for_review(candidate: dict[str, Any], existing: dict[str, Any] | None, score: float, reasons: list[str]) -> dict[str, Any]:
    return {
        "candidate": candidate,
        "existing": existing,
        "score": score,
        "reasons": reasons,
        "status": "open",
    }
