from __future__ import annotations

from typing import Any

from integration.compatibility_mapper import legacy_product_from_v2_claim


def facade_response(claims: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "mappings": [legacy_product_from_v2_claim(claim) for claim in claims],
        "totalRecords": len(claims),
    }
