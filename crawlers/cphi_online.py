from __future__ import annotations

from crawlers.common import CrawlBlocked, get_source_policy


class CphiOnlineCrawler:
    def __init__(self) -> None:
        self.policy = get_source_policy("CPHI Online")

    def crawl(self) -> None:
        raise CrawlBlocked("CPHI Online is flagged requires_permission in source manifest.")
