from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse
import hashlib
import os

import httpx

from crawlers.common import DEFAULT_USER_AGENT


def download_allowed_pdf(url: str, target_dir: str) -> dict[str, str]:
    response = httpx.get(url, headers={"User-Agent": DEFAULT_USER_AGENT}, timeout=30.0, follow_redirects=True)
    response.raise_for_status()
    content = response.content
    sha256 = hashlib.sha256(content).hexdigest()
    name = os.path.basename(urlparse(url).path) or f"{sha256}.pdf"
    out_path = Path(target_dir) / name
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(content)
    return {"path": str(out_path), "sha256": sha256}
