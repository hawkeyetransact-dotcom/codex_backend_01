from __future__ import annotations

from typing import Any


def legacy_product_from_v2_claim(claim: dict[str, Any]) -> dict[str, Any]:
    product = claim.get("catalogProduct") or {}
    offer = claim.get("offer") or {}
    sites = claim.get("sites") or []
    first_site = sites[0].get("siteId") if sites else {}
    return {
        "_id": claim.get("_id"),
        "product_id": {
            "_id": product.get("_id"),
            "name": product.get("canonicalName", ""),
            "casNumber": product.get("identifiers", {}).get("cas", ""),
            "description": product.get("description", ""),
            "apiTechnology": product.get("quality", {}).get("specReference", ""),
            "dosageForm": product.get("fdf", {}).get("dosageForm", ""),
        },
        "site_id": first_site or {},
        "offer": offer,
        "verificationStatus": claim.get("verificationStatus"),
    }
