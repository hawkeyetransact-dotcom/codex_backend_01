from __future__ import annotations

from pdf_extract.coa_parser import parse_coa_text


def test_coa_parser_extracts_batch_and_release() -> None:
    data = parse_coa_text("Product: Ibuprofen\nBatch: ABC123\nRelease Date: 2026-03-12")
    assert data["batch"] == "ABC123"
    assert data["release_date"] == "2026-03-12"
