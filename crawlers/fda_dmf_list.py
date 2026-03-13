from __future__ import annotations

from pathlib import Path

from crawlers.common import PoliteClient, get_source_policy


class FdaDmfListCrawler:
    def __init__(self) -> None:
        self.policy = get_source_policy("FDA DMF list")
        self.client = PoliteClient(self.policy)

    def crawl(self) -> str:
        response = self.client.get("https://www.fda.gov/drugs/drug-master-files-dmfs/drug-master-file-list")
        return response.text
