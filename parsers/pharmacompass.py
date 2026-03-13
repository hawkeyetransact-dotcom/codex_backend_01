from __future__ import annotations

from parsers.common import headings_and_blocks, find_kv_pairs

_ALLOWED_KEYS = ["CAS", "DMF", "CEP", "Manufacturer", "Country"]


def parse_pharmacompass(html: str) -> dict:
    blocks = headings_and_blocks(html)
    text = " ".join(blocks.values())
    return {"blocks": blocks, "fields": find_kv_pairs(text, _ALLOWED_KEYS)}
