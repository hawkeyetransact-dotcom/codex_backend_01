from __future__ import annotations

from integration.compatibility_mapper import legacy_product_from_v2_claim


def test_compatibility_mapper_keeps_legacy_shape() -> None:
    mapped = legacy_product_from_v2_claim({
        "_id": "claim1",
        "catalogProduct": {"_id": "prod1", "canonicalName": "Acetaminophen", "identifiers": {"cas": "103-90-2"}, "description": "", "quality": {}, "fdf": {}},
        "sites": [],
    })
    assert mapped["product_id"]["name"] == "Acetaminophen"
