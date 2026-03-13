from __future__ import annotations

from parsers.common import headings_and_blocks, find_kv_pairs

_KEYS = ["Place of Origin", "Certification", "MOQ", "Packaging Details", "Delivery Time", "Payment Terms", "CAS", "Assay", "Appearance"]


def parse_cphi_online(html: str) -> dict:
    blocks = headings_and_blocks(html)
    text = " ".join(blocks.values())
    return {"blocks": blocks, "fields": find_kv_pairs(text, _KEYS)}
