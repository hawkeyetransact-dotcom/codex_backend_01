from __future__ import annotations

from pathlib import Path


def extract_pdf_text(file_path: str) -> str:
    try:
        from pdfminer.high_level import extract_text
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("pdfminer.six is required for PDF text extraction") from exc
    return extract_text(Path(file_path))
