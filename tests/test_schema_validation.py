from __future__ import annotations

import json
from pathlib import Path


def test_schema_contains_core_sections() -> None:
    schema = json.loads(Path("schemas/product_form.schema.json").read_text(encoding="utf-8"))
    assert "product" in schema["properties"]
    assert "supplier" in schema["properties"]
    assert "documents" in schema["properties"]
