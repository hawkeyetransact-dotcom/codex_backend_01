from __future__ import annotations

from typing import Any


def provenance_event(source_name: str, source_url: str, fetched_at: str, confidence: float, parser_version: str = "1.0.0") -> dict[str, Any]:
    return {
        "source_name": source_name,
        "source_url": source_url,
        "fetched_at_utc": fetched_at,
        "parser_version": parser_version,
        "confidence_score": confidence,
        "raw_snippet_ref": "",
        "claim_origin": "claimed",
        "verification_status": "claimed",
    }
