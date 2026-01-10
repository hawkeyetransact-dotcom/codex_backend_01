import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { NotificationPolicy } from "../src/models/notificationPolicyModel.js";
import { UserNotificationPreference } from "../src/models/userNotificationPreferenceModel.js";
import { getEffectivePolicy } from "../src/services/governance/notificationPolicyService.js";

const run = async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const persona = "TENANT_ADMIN";
  const eventKey = "audit.created";

  await NotificationPolicy.create({
    scope: "PLATFORM_DEFAULT",
    persona,
    eventKey,
    allowedChannels: ["IN_APP", "EMAIL"],
    deliveryMode: "REALTIME",
    isEnabled: true,
    version: 1,
  });

  await NotificationPolicy.create({
    scope: "TENANT_OVERRIDE",
    tenantId,
    persona,
    eventKey,
    allowedChannels: ["IN_APP"],
    deliveryMode: "REALTIME",
    isEnabled: true,
    version: 1,
  });

  await UserNotificationPreference.create({
    tenantId,
    userId,
    eventKey,
    channelOverrides: ["EMAIL"],
  });

  const blocked = await getEffectivePolicy({ tenantId, persona, eventKey, userId });
  assert.equal(blocked.isEnabled, false);
  assert.deepEqual(blocked.allowedChannels, []);

  await UserNotificationPreference.updateOne(
    { tenantId, userId, eventKey },
    { channelOverrides: ["IN_APP"], deliveryModeOverride: "DIGEST_WEEKLY" }
  );

  const effective = await getEffectivePolicy({ tenantId, persona, eventKey, userId });
  assert.equal(effective.isEnabled, true);
  assert.deepEqual(effective.allowedChannels, ["IN_APP"]);
  assert.equal(effective.deliveryMode, "DIGEST_WEEKLY");
  assert.equal(effective.source, "TENANT_OVERRIDE");

  await NotificationPolicy.updateOne(
    { scope: "TENANT_OVERRIDE", tenantId, persona, eventKey },
    { isEnabled: false }
  );

  const disabled = await getEffectivePolicy({ tenantId, persona, eventKey, userId });
  assert.equal(disabled.isEnabled, false);
  assert.equal(disabled.reason, "POLICY_DISABLED");
  assert.equal(disabled.source, "TENANT_OVERRIDE");

  await mongoose.connection.close();
  await mongoServer.stop();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
