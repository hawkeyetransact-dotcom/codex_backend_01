from __future__ import annotations

import json
from pathlib import Path

from integration.compatibility_mapper import legacy_product_from_v2_claim


ROOT = Path(__file__).resolve().parents[1]


def test_legacy_product_from_v2_claim_preserves_expected_shape() -> None:
    payload = {
        "_id": "claim-1",
        "verificationStatus": "claimed",
        "catalogProduct": {
            "_id": "prod-1",
            "canonicalName": "Acetaminophen",
            "description": "API product",
            "identifiers": {"cas": "103-90-2"},
            "quality": {"specReference": "USP"},
            "fdf": {"dosageForm": ""},
        },
        "sites": [{"siteId": {"_id": "site-1", "site_name": "Plant 1"}}],
        "offer": {"visibility": "private"},
    }

    legacy = legacy_product_from_v2_claim(payload)

    assert legacy["_id"] == "claim-1"
    assert legacy["product_id"]["name"] == "Acetaminophen"
    assert legacy["product_id"]["casNumber"] == "103-90-2"
    assert legacy["site_id"]["site_name"] == "Plant 1"
    assert legacy["verificationStatus"] == "claimed"


def test_source_manifest_marks_restricted_sources_as_non_public() -> None:
    manifest = json.loads((ROOT / "sources" / "source_manifest.json").read_text(encoding="utf-8"))
    by_name = {item["source"]: item for item in manifest}

    assert by_name["openFDA Drug NDC"]["legal_status"] in {"allowed_public", "allowed_with_rate_limits"}
    assert by_name["PharmaCompass"]["legal_status"] == "requires_permission"
    assert by_name["CPHI Online"]["requires_partnership_login"] is True
