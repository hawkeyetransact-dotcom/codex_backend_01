from __future__ import annotations

from bs4 import BeautifulSoup
import re
from typing import Iterable


def soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def find_kv_pairs(text: str, allowed_keys: Iterable[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for key in allowed_keys:
        pattern = re.compile(rf"{re.escape(key)}\s*[:\-]\s*(.+)", re.IGNORECASE)
        match = pattern.search(text)
        if match:
            result[key] = match.group(1).strip()
    return result


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def headings_and_blocks(html: str) -> dict[str, str]:
    doc = soup(html)
    data: dict[str, str] = {}
    for heading in doc.find_all(["h1", "h2", "h3", "h4"]):
        label = normalize_whitespace(heading.get_text(" ", strip=True))
        block = []
        for sib in heading.find_next_siblings():
            if getattr(sib, "name", None) in {"h1", "h2", "h3", "h4"}:
                break
            block.append(normalize_whitespace(sib.get_text(" ", strip=True)))
        if label:
            data[label] = normalize_whitespace(" ".join(block))
    return data
