from __future__ import annotations

from typing import Protocol, Iterable, Any


class ProductCatalogFacade(Protocol):
    def list_claims(self, tenant_id: str, page: int = 1, limit: int = 20) -> dict[str, Any]: ...
    def create_claim(self, payload: dict[str, Any]) -> dict[str, Any]: ...
    def search_products(self, query: str, listing_type: str | None = None) -> list[dict[str, Any]]: ...


class EvidenceExtractor(Protocol):
    def extract(self, file_path: str) -> dict[str, Any]: ...


class SearchIndexer(Protocol):
    def index_batch(self, records: Iterable[dict[str, Any]]) -> None: ...
