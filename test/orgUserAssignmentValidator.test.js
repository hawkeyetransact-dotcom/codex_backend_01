import assert from "assert";
import {
  createOrgUserAssignmentValidator,
  updateOrgUserAssignmentValidator,
} from "../src/validators/orgDirectoryValidators.js";

const validCreatePayload = {
  userId: "507f1f77bcf86cd799439011",
  siteId: "507f1f77bcf86cd799439012",
  orgUnitId: "507f1f77bcf86cd799439013",
  orgRole: "QUALITY_LEAD",
  assignmentType: "PRIMARY",
  businessFunction: "QUALITY",
  title: "QA Manager",
  isPrimary: true,
  status: "ACTIVE",
};

const validCreate = createOrgUserAssignmentValidator.validate(validCreatePayload);
assert.equal(validCreate.error, undefined);

const invalidCreate = createOrgUserAssignmentValidator.validate({
  ...validCreatePayload,
  orgRole: "NOT_A_ROLE",
});
assert.ok(invalidCreate.error);

const validUpdate = updateOrgUserAssignmentValidator.validate({
  orgRole: "SITE_LEAD",
  status: "INACTIVE",
});
assert.equal(validUpdate.error, undefined);

const emptyUpdate = updateOrgUserAssignmentValidator.validate({});
assert.ok(emptyUpdate.error);
