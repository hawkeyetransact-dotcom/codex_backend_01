from __future__ import annotations

from crawlers.common import CrawlBlocked, get_source_policy


class PharmaOfferCrawler:
    def __init__(self) -> None:
        self.policy = get_source_policy("Pharmaoffer")

    def crawl(self) -> None:
        raise CrawlBlocked("Pharmaoffer is flagged requires_permission in source manifest.")
