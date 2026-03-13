from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    template_path = Path("storage/opensearch/index_template.json")
    print(json.dumps(json.loads(template_path.read_text(encoding="utf-8")), indent=2))


if __name__ == "__main__":
    main()
