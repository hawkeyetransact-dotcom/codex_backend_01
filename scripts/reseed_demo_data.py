from __future__ import annotations

import os
from datetime import datetime
from pymongo import MongoClient


def main() -> None:
    mongo_uri = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/hawkeye_dev")
    db_name = os.getenv("MONGO_DB_NAME", mongo_uri.rsplit("/", 1)[-1])
    client = MongoClient(mongo_uri)
    db = client[db_name]
    now = datetime.utcnow()
    product = db["catalog_products_v2"].insert_one({
        "listingType": "API",
        "canonicalName": "Acetaminophen",
        "normalizedName": "acetaminophen",
        "synonyms": ["Paracetamol"],
        "description": "Synthetic seeded API listing",
        "identifiers": {"cas": "103-90-2", "inn": "paracetamol"},
        "verificationStatus": "review_required",
        "sourcePriority": 100,
        "sourceLastFetchedAt": now,
        "refreshStatus": "ready",
        "refreshStrategy": "manual_review",
        "searchKeywords": ["acetaminophen", "paracetamol", "103-90-2"],
        "createdAt": now,
        "updatedAt": now,
    }).inserted_id
    db["product_provenance_events_v2"].insert_one({
        "resourceType": "catalog_product",
        "resourceId": product,
        "fieldPath": "/",
        "sourceName": "synthetic_fixture",
        "sourceUrl": "https://example.com",
        "fetchedAtUtc": now,
        "parserVersion": "1.0.0",
        "confidenceScore": 1.0,
        "claimOrigin": "supplier_submission",
        "verificationStatus": "claimed",
        "sourceRecordHash": "synthetic",
        "createdAt": now,
        "updatedAt": now,
    })
    print("Seeded synthetic marketplace v2 product")


if __name__ == "__main__":
    main()
