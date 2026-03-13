from __future__ import annotations

import re
from typing import Any


def parse_coa_text(text: str) -> dict[str, Any]:
    def grab(label: str) -> str:
        match = re.search(rf"{label}\s*[:\-]\s*(.+)", text, re.IGNORECASE)
        return match.group(1).strip() if match else ""
    tests = []
    for line in text.splitlines():
        if ":" in line and any(token in line.lower() for token in ["assay", "appearance", "water", "impurity"]):
            left, right = line.split(":", 1)
            tests.append({"test": left.strip(), "result": right.strip(), "method": "", "spec": ""})
    return {
        "product_name": grab("product"),
        "batch": grab("batch") or grab("lot"),
        "release_date": grab("release date"),
        "retest_or_expiry_date": grab("retest") or grab("expiry date"),
        "test_results": tests,
        "signer": grab("approved by") or grab("signer"),
    }
