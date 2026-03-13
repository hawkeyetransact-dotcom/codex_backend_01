from __future__ import annotations

from typing import Any


def parse_openfda_ndc(payload: dict[str, Any]) -> list[dict[str, Any]]:
    results = []
    for row in payload.get("results", []):
        results.append(
            {
                "listing_type": "FDF",
                "canonical_name": row.get("brand_name") or row.get("generic_name") or "",
                "identifiers": {
                    "product_ndc": row.get("product_ndc", ""),
                    "package_ndc": row.get("package_ndc", ""),
                    "inn": row.get("generic_name", ""),
                },
                "fdf": {
                    "dosage_form": row.get("dosage_form", ""),
                    "route": (row.get("route") or [""])[0] if isinstance(row.get("route"), list) else row.get("route", ""),
                },
                "supplier": {"name": row.get("labeler_name", ""), "role": ["manufacturer"]},
                "source_row": row,
            }
        )
    return results
