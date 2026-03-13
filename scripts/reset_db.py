from __future__ import annotations

import os
from pymongo import MongoClient

COLLECTIONS = [
    "catalog_products_v2",
    "catalog_product_variants_v2",
    "supplier_product_claims_v2",
    "supplier_product_offers_v2",
    "supplier_product_site_links_v2",
    "compliance_claim_records_v2",
    "product_evidence_links_v2",
    "product_provenance_events_v2",
    "product_merge_events_v2",
    "product_refresh_runs_v2",
    "product_review_queue_v2",
]


def main() -> None:
    mongo_uri = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/hawkeye_dev")
    db_name = os.getenv("MONGO_DB_NAME", mongo_uri.rsplit("/", 1)[-1])
    client = MongoClient(mongo_uri)
    db = client[db_name]
    for name in COLLECTIONS:
        db[name].drop()
        print(f"Dropped {name}")


if __name__ == "__main__":
    main()
