from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class ProvenanceRecord:
    source_name: str
    source_url: str
    fetched_at_utc: str
    parser_version: str
    confidence_score: float
    raw_snippet_ref: str = ""
    claim_origin: str = "claimed"
    verification_status: str = "claimed"


@dataclass(slots=True)
class NormalizedListing:
    listing_type: str
    canonical_name: str
    identifiers: dict[str, Any] = field(default_factory=dict)
    synonyms: list[str] = field(default_factory=list)
    description: str = ""
    supplier_name: str = ""
    supplier_role: list[str] = field(default_factory=list)
    country_of_origin: str = ""
    compliance_claims: list[str] = field(default_factory=list)
    evidence_docs: list[dict[str, Any]] = field(default_factory=list)
    provenance: list[ProvenanceRecord] = field(default_factory=list)
