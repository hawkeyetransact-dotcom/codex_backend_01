from __future__ import annotations

from parsers.common import headings_and_blocks


def parse_eudragmdp(html: str) -> list[dict]:
    blocks = headings_and_blocks(html)
    return [{"section": key, "content": value} for key, value in blocks.items()]
