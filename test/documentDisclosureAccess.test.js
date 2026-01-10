import assert from "assert";
import { isPolicyActive, policyAllowsUser, canAccessPolicy } from "../src/utils/documentDisclosure.js";

const run = () => {
  const now = new Date("2025-01-01T12:00:00Z");
  const policy = {
    startAt: new Date("2025-01-01T10:00:00Z"),
    endAt: new Date("2025-01-01T14:00:00Z"),
    recipients: [{ type: "email", value: "auditor@test.com" }],
  };

  assert.strictEqual(isPolicyActive(policy, now), true);
  assert.strictEqual(isPolicyActive(policy, new Date("2025-01-01T09:00:00Z")), false);
  assert.strictEqual(isPolicyActive(policy, new Date("2025-01-01T15:00:00Z")), false);

  const user = { _id: "123", email: "auditor@test.com", role: "auditor" };
  assert.strictEqual(policyAllowsUser(policy, user), true);

  const otherUser = { _id: "124", email: "buyer@test.com", role: "buyer" };
  assert.strictEqual(policyAllowsUser(policy, otherUser), false);
  assert.strictEqual(canAccessPolicy(policy, otherUser, now), false);
  assert.strictEqual(canAccessPolicy(policy, user, now), true);

  const rolePolicy = {
    startAt: new Date("2025-01-01T10:00:00Z"),
    endAt: new Date("2025-01-01T14:00:00Z"),
    recipients: [{ type: "role", value: "buyer" }],
  };
  assert.strictEqual(canAccessPolicy(rolePolicy, otherUser, now), true);
};

run();
