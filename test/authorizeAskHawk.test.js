import assert from "assert";
import { authorizeAskHawk } from "../src/middlewares/authorizeAskHawk.js";

const mockReq = (body = {}, headers = {}, query = {}) => ({ body, headers, query });

const run = () => {
  let called = false;
  const next = () => {
    called = true;
  };
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
    },
  };

  authorizeAskHawk(mockReq({ tenantId: "t1", role: "AUDITOR" }), res, next);
  assert.ok(called, "next should be called for valid context");

  called = false;
  authorizeAskHawk(mockReq({}, {}), res, next);
  assert.equal(res.statusCode, 400);
  assert.ok(res.payload.message.includes("tenantId"));
};

run();
