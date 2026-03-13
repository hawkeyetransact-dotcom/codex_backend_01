from __future__ import annotations

import re
from typing import Any


def parse_certificate_text(text: str) -> dict[str, Any]:
    def grab(pattern: str) -> str:
        match = re.search(pattern, text, re.IGNORECASE)
        return match.group(1).strip() if match else ""
    return {
        "issuing_authority": grab(r"Authority\s*[:\-]\s*(.+)"),
        "site_address": grab(r"Address\s*[:\-]\s*(.+)"),
        "scope": grab(r"Scope\s*[:\-]\s*(.+)"),
        "issue_date": grab(r"Issue Date\s*[:\-]\s*(.+)"),
        "expiry_date": grab(r"Expiry Date\s*[:\-]\s*(.+)"),
        "certificate_number": grab(r"Certificate(?: Number| No\.)?\s*[:\-]\s*(.+)"),
    }
