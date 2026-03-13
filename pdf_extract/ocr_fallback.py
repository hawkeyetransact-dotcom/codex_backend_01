from __future__ import annotations

from pathlib import Path


def run_ocr_fallback(file_path: str) -> str:
    try:
        import pytesseract  # type: ignore
        from pdf2image import convert_from_path  # type: ignore
    except ImportError:
        return ""
    text_parts: list[str] = []
    for image in convert_from_path(str(Path(file_path))):
        text_parts.append(pytesseract.image_to_string(image))
    return "\n".join(text_parts)
