from __future__ import annotations

from normalize.canonicalize import normalize_moq, normalize_price
from normalize.validators import validate_listing


def test_normalize_moq_negotiable() -> None:
    assert normalize_moq("Negotiation", "kg")["is_negotiable"] is True


def test_validate_listing_api_requires_identifier() -> None:
    errors = validate_listing({"product": {"listing_type": "API", "identifiers": {}}})
    assert errors
