import assert from "assert";
import { normalizeApiName, normalizeSupplierName } from "../src/utils/normalization.js";

const run = () => {
  assert.strictEqual(normalizeApiName("  Metformin HCl "), "metformin hcl");
  assert.strictEqual(normalizeApiName("Acetyl-Salicylic Acid"), "acetyl salicylic acid");

  assert.strictEqual(normalizeSupplierName("Acme Inc."), "acme");
  assert.strictEqual(normalizeSupplierName("Global Pharma LLC"), "global pharma");
  assert.strictEqual(normalizeSupplierName("Nova Bio GmbH"), "nova bio");

  console.log("normalization tests passed");
};

run();
