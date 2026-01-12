import assert from "assert";
import { encryptSecret, decryptSecret } from "../src/integrations/services/crypto.js";

process.env.INTEGRATION_SECRET_KEY = "integration-secret-test-key";

const run = () => {
  const payload = { apiKey: "demo-key", username: "demo" };
  const encrypted = encryptSecret(payload);
  assert.ok(encrypted);
  const decrypted = decryptSecret(encrypted);
  assert.deepStrictEqual(decrypted, payload);
};

run();
