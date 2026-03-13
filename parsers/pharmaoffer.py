from __future__ import annotations

from parsers.common import headings_and_blocks, find_kv_pairs

_KEYS = ["Supplier name", "Type", "Country", "Product origin", "Certifications", "Portfolio size"]


def parse_pharmaoffer(html: str) -> dict:
    blocks = headings_and_blocks(html)
    text = " ".join(blocks.values())
    return {"blocks": blocks, "fields": find_kv_pairs(text, _KEYS)}
