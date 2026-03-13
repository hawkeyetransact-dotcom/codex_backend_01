from __future__ import annotations


def extract_pdf_tables(file_path: str) -> list[dict]:
    try:
        import camelot  # type: ignore
    except ImportError:
        return []
    tables = camelot.read_pdf(file_path, pages="all")
    return [table.df.to_dict(orient="records") for table in tables]
