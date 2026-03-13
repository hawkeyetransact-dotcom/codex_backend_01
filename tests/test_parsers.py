from __future__ import annotations

from parsers.openfda_ndc import parse_openfda_ndc


def test_openfda_parser_maps_listing_type() -> None:
    rows = parse_openfda_ndc({"results": [{"brand_name": "Foo", "product_ndc": "1234-567-89", "labeler_name": "Bar Labs"}]})
    assert rows[0]["listing_type"] == "FDF"
    assert rows[0]["identifiers"]["product_ndc"] == "1234-567-89"
