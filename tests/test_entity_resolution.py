from __future__ import annotations

from entity_resolution.scorer import score_candidate


def test_entity_resolution_scores_exact_cas_high() -> None:
    score = score_candidate(
        {"identifiers": {"cas": "103-90-2"}, "canonical_name": "Acetaminophen"},
        {"identifiers": {"cas": "103-90-2"}, "canonical_name": "Paracetamol"},
    )
    assert score >= 0.98
