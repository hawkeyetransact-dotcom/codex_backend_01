from __future__ import annotations

from crawlers.common import CrawlBlocked, get_source_policy


class EudraGmdpCrawler:
    def __init__(self) -> None:
        self.policy = get_source_policy("EudraGMDP public registry")

    def crawl(self) -> None:
        raise CrawlBlocked("EudraGMDP is UI-driven; use approved low-rate fetch jobs only and stop on access restrictions.")
