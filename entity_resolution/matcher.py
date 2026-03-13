from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from difflib import SequenceMatcher


@dataclass(slots=True)
class MatchResult:
    score: float
    reason: str
    auto_merge: bool
    needs_human_review: bool


def string_similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, (left or "").lower(), (right or "").lower()).ratio()


def deterministic_match(candidate: dict[str, Any], existing: dict[str, Any]) -> MatchResult | None:
    ci = candidate.get("identifiers", {})
    ei = existing.get("identifiers", {})
    if ci.get("cas") and ci.get("cas") == ei.get("cas"):
        return MatchResult(0.99, "CAS exact match", True, False)
    if ci.get("product_ndc") and ci.get("product_ndc") == ei.get("product_ndc"):
        return MatchResult(0.99, "Product NDC exact match", True, False)
    return None
