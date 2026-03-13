from __future__ import annotations

import re
from typing import Any


SECTION_HEADERS = [str(i) for i in range(1, 17)]


def parse_sds_text(text: str) -> dict[str, Any]:
    sections: dict[str, str] = {}
    current = None
    buffer: list[str] = []
    for line in text.splitlines():
        normalized = line.strip()
        header_match = re.match(r"^Section\s*(\d{1,2})|^(\d{1,2})\.\s", normalized, re.IGNORECASE)
        if header_match:
            if current is not None:
                sections[current] = " ".join(buffer).strip()
            current = header_match.group(1) or header_match.group(2)
            buffer = [normalized]
            continue
        if current is not None:
            buffer.append(normalized)
    if current is not None:
        sections[current] = " ".join(buffer).strip()
    return {
        "identification": sections.get("1", ""),
        "hazards": sections.get("2", ""),
        "composition": sections.get("3", ""),
        "handling_storage": sections.get("7", ""),
        "exposure_controls": sections.get("8", ""),
        "transport": sections.get("14", ""),
        "sections": sections,
    }
