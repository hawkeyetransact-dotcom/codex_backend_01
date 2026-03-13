from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator
import json
import os
import random
import re
import time
import urllib.parse
import urllib.robotparser

import httpx

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_USER_AGENT = os.getenv(
    "HAWKEYE_CRAWLER_USER_AGENT",
    "HawkeyeMarketplaceBot/1.0 (+compliance@hawkeyesmart.com)",
)


@dataclass(slots=True)
class RateLimitPolicy:
    requests_per_minute: int
    burst: int = 1
    concurrency: int = 1
    backoff: str = "exponential_jitter"


@dataclass(slots=True)
class SourcePolicy:
    source_name: str
    base_url: str
    allowed_patterns: list[str]
    legal_status: str
    requires_partnership_login: bool
    rate_limit_policy: RateLimitPolicy
    robots_obey: bool = True


class CrawlBlocked(RuntimeError):
    pass


def load_source_manifest() -> list[dict]:
    return json.loads((REPO_ROOT / "sources" / "source_manifest.json").read_text(encoding="utf-8"))


def get_source_policy(source_name: str) -> SourcePolicy:
    for item in load_source_manifest():
        if item["source"] == source_name:
            rl = item.get("rate_limit_policy", {})
            return SourcePolicy(
                source_name=source_name,
                base_url=item["base_url"],
                allowed_patterns=item.get("allowed_url_patterns", []),
                legal_status=item["legal_status"],
                requires_partnership_login=bool(item.get("requires_partnership_login")),
                rate_limit_policy=RateLimitPolicy(
                    requests_per_minute=int(rl.get("requests_per_minute", 1)),
                    burst=int(rl.get("burst", 1)),
                    concurrency=int(rl.get("concurrency", 1)),
                    backoff=str(rl.get("backoff", "exponential_jitter")),
                ),
                robots_obey=bool(item.get("robots_policy", {}).get("obey", True)),
            )
    raise KeyError(f"Unknown source policy: {source_name}")


def assert_url_allowed(policy: SourcePolicy, url: str) -> None:
    if policy.legal_status in {"requires_permission", "disallowed"}:
        raise CrawlBlocked(f"{policy.source_name} marked as {policy.legal_status}")
    if not any(re.match(pattern, url) for pattern in policy.allowed_patterns):
        raise CrawlBlocked(f"URL not allowlisted for {policy.source_name}: {url}")
    if policy.requires_partnership_login:
        raise CrawlBlocked(f"{policy.source_name} requires permission or partnership for automated extraction")


def assert_robots_allowed(policy: SourcePolicy, url: str, user_agent: str = DEFAULT_USER_AGENT) -> None:
    if not policy.robots_obey:
        return
    parsed = urllib.parse.urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(robots_url)
    rp.read()
    if not rp.can_fetch(user_agent, url):
        raise CrawlBlocked(f"robots.txt blocks {url}")


class PoliteClient:
    def __init__(self, policy: SourcePolicy, user_agent: str = DEFAULT_USER_AGENT) -> None:
        self.policy = policy
        self.user_agent = user_agent
        self.client = httpx.Client(
            headers={"User-Agent": user_agent},
            timeout=30.0,
            follow_redirects=True,
        )
        self.min_interval = 60.0 / max(policy.rate_limit_policy.requests_per_minute, 1)
        self._last_request = 0.0

    def get(self, url: str, **kwargs) -> httpx.Response:
        assert_url_allowed(self.policy, url)
        assert_robots_allowed(self.policy, url, self.user_agent)
        now = time.monotonic()
        delta = now - self._last_request
        if delta < self.min_interval:
            time.sleep(self.min_interval - delta)
        response = self.client.get(url, **kwargs)
        self._last_request = time.monotonic()
        if response.status_code in {401, 403, 429}:
            raise CrawlBlocked(f"Access blocked for {url}: {response.status_code}")
        return response

    def close(self) -> None:
        self.client.close()


def chunked(items: Iterable[dict], size: int) -> Iterator[list[dict]]:
    batch: list[dict] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def backoff_seconds(attempt: int) -> float:
    return min(60.0, (2 ** attempt) + random.random())
