from __future__ import annotations

UNIT_ALIASES = {
    "kg": "kg",
    "kilogram": "kg",
    "kilograms": "kg",
    "g": "g",
    "gram": "g",
    "grams": "g",
    "mg": "mg",
    "mcg": "mcg",
    "%": "%",
    "mg/ml": "mg/mL",
    "units": "units",
}


def canonical_unit(value: str) -> str:
    if not value:
        return ""
    return UNIT_ALIASES.get(value.strip().lower(), value.strip())
