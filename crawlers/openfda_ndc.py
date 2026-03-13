from __future__ import annotations

from typing import Any

from crawlers.common import PoliteClient, get_source_policy


class OpenFdaNdcCrawler:
    def __init__(self) -> None:
        self.policy = get_source_policy("openFDA Drug NDC")
        self.client = PoliteClient(self.policy)

    def crawl(self, search: str = "", limit: int = 100, skip: int = 0) -> dict[str, Any]:
        params = {"limit": min(limit, 100), "skip": max(skip, 0)}
        if search:
            params["search"] = search
        response = self.client.get("https://api.fda.gov/drug/ndc.json", params=params)
        return response.json()
