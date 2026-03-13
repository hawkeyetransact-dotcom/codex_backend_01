from __future__ import annotations

from typing import Any


def has_conflict(candidate: dict[str, Any], existing: dict[str, Any]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if candidate.get("salt_or_form") and existing.get("salt_or_form") and candidate["salt_or_form"] != existing["salt_or_form"]:
        reasons.append("salt_or_form differs")
    if candidate.get("dosage_form") and existing.get("dosage_form") and candidate["dosage_form"] != existing["dosage_form"]:
        reasons.append("dosage_form differs")
    if candidate.get("strength") and existing.get("strength") and candidate["strength"] != existing["strength"]:
        reasons.append("strength differs")
    return bool(reasons), reasons
