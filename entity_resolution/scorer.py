from __future__ import annotations

from typing import Any

from entity_resolution.matcher import deterministic_match, string_similarity


def score_candidate(candidate: dict[str, Any], existing: dict[str, Any]) -> float:
    exact = deterministic_match(candidate, existing)
    if exact:
        return exact.score
    score = string_similarity(candidate.get("canonical_name", ""), existing.get("canonical_name", ""))
    if candidate.get("country_of_origin") and candidate.get("country_of_origin") == existing.get("country_of_origin"):
        score += 0.05
    return min(score, 1.0)
