from __future__ import annotations

from crawlers.common import CrawlBlocked, get_source_policy


class EdqmCepCrawler:
    def __init__(self) -> None:
        self.policy = get_source_policy("EDQM CEP database")

    def crawl(self) -> None:
        raise CrawlBlocked("EDQM CEP database is UI-driven and must run only in approved low-rate jobs with explicit legal review.")
