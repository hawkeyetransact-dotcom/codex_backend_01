import assert from "assert";
import {
  getFormSchemaAsset,
  getFormUiAsset,
  getSourceManifestAsset,
} from "../src/services/marketplaceCatalog/productCatalogService.js";

const schema = getFormSchemaAsset();
const ui = getFormUiAsset();
const sources = getSourceManifestAsset();

assert.ok(schema?.properties?.product, "schema must include product section");
assert.ok(ui?.layout?.sections?.length, "ui spec must define sections");
assert.ok(Array.isArray(sources) && sources.length >= 4, "source manifest must contain sources");

console.log("marketplaceCatalogAssets.test.js passed");
