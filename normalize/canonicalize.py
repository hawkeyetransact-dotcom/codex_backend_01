from __future__ import annotations

import re
from typing import Any


def canonicalize_name(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9]+", " ", value or "")).strip().lower()


def parse_numeric_token(value: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)", value or "")
    return float(match.group(1)) if match else None


def normalize_moq(value: Any, unit: str | None = None) -> dict[str, Any]:
    text = str(value or "").strip()
    if not text:
        return {"value": None, "unit": unit or "", "is_negotiable": False}
    if text.lower() in {"negotiation", "on request", "negotiable"}:
        return {"value": None, "unit": unit or "", "is_negotiable": True}
    return {"value": parse_numeric_token(text), "unit": unit or "", "is_negotiable": False}


def normalize_price(value: Any, currency: str | None = None, basis: str | None = None) -> dict[str, Any]:
    text = str(value or "").strip()
    if not text:
        return {"currency": currency or "", "amount": None, "basis": basis or "", "is_on_request": False}
    if text.lower() in {"negotiation", "on request", "rfq"}:
        return {"currency": currency or "", "amount": None, "basis": basis or "", "is_on_request": True}
    return {"currency": (currency or "").upper(), "amount": parse_numeric_token(text), "basis": basis or "", "is_on_request": False}
