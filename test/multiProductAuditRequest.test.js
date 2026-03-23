import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createAuditRequestValidator } from "../src/validators/buyerValidator.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";

const buildPayload = () => ({
  supplier_id: new mongoose.Types.ObjectId().toString(),
  site_id: new mongoose.Types.ObjectId().toString(),
  auditETA: new Date().toISOString(),
});

const run = async () => {
  const multiValidation = createAuditRequestValidator.validate({
    ...buildPayload(),
    supplier_product_ids: [
      new mongoose.Types.ObjectId().toString(),
      new mongoose.Types.ObjectId().toString(),
    ],
  });
  assert.equal(multiValidation.error, undefined);

  const singleValidation = createAuditRequestValidator.validate({
    ...buildPayload(),
    supplier_product_id: new mongoose.Types.ObjectId().toString(),
  });
  assert.equal(singleValidation.error, undefined);

  const invalidValidation = createAuditRequestValidator.validate(buildPayload());
  assert.ok(invalidValidation.error);

  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const productA = new mongoose.Types.ObjectId();
  const productB = new mongoose.Types.ObjectId();
  const request = await AuditRequestMaster.create({
    supplier_id: new mongoose.Types.ObjectId(),
    create_by_buyer_id: new mongoose.Types.ObjectId(),
    supplier_product_id: productA,
    supplier_product_ids: [productA, productB],
    site_id: new mongoose.Types.ObjectId(),
    complianceDate: new Date(),
    auditETA: new Date(),
  });

  assert.equal(String(request.supplier_product_id), String(productA));
  assert.deepEqual(
    request.supplier_product_ids.map((id) => String(id)),
    [String(productA), String(productB)]
  );

  await mongoose.disconnect();
  await mongoServer.stop();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
