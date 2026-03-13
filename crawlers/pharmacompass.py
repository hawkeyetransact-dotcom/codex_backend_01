from __future__ import annotations

from crawlers.common import CrawlBlocked, get_source_policy


class PharmaCompassCrawler:
    def __init__(self) -> None:
        self.policy = get_source_policy("PharmaCompass")

    def crawl(self) -> None:
        raise CrawlBlocked("PharmaCompass is flagged requires_permission in source manifest.")
