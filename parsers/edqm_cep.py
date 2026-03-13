from __future__ import annotations

from parsers.common import headings_and_blocks, normalize_whitespace


def parse_edqm_cep(html: str) -> list[dict]:
    blocks = headings_and_blocks(html)
    return [{"section": key, "content": value} for key, value in blocks.items()]
