from __future__ import annotations

from typing import Any


def validate_listing(record: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    product = record.get("product", {})
    if product.get("listing_type") == "API":
        identifiers = product.get("identifiers", {})
        if not identifiers.get("cas") and not identifiers.get("inn"):
            errors.append("API listing requires CAS or INN")
    if product.get("listing_type") == "FDF":
        fdf = record.get("fdf", {})
        if not fdf.get("dosage_form"):
            errors.append("FDF listing requires dosage form")
        if not fdf.get("strength", {}).get("value"):
            errors.append("FDF listing requires strength value")
        if not fdf.get("strength", {}).get("unit"):
            errors.append("FDF listing requires strength unit")
    return errors
