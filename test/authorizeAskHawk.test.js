import assert from "assert";
import { authorizeAskHawk } from "../src/middlewares/authorizeAskHawk.js";

const mockReq = (body = {}, headers = {}, query = {}, extra = {}) => ({ body, headers, query, ...extra });

const run = () => {
  const createRes = () => ({
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
    },
  });

  let called = false;
  const next = () => {
    called = true;
  };

  let res = createRes();
  authorizeAskHawk(mockReq({ tenantId: "t1", role: "AUDITOR" }), res, next);
  assert.ok(called, "next should be called for valid context");
  assert.equal(String(res?.statusCode || 200), "200");

  called = false;
  res = createRes();
  authorizeAskHawk(
    mockReq({ tenantId: "t1" }, {}, {}, { tenantId: "t2", user: { role: "auditor" } }),
    res,
    next
  );
  assert.equal(res.statusCode, 403);

  called = false;
  res = createRes();
  authorizeAskHawk(mockReq({}, {}), res, next);
  assert.equal(res.statusCode, 400);
  assert.ok(res.payload.message.includes("tenantId"));

  called = false;
  res = createRes();
  authorizeAskHawk(
    mockReq({}, {}, {}, { user: { role: "admin", adminScope: "PLATFORM" }, adminScope: "PLATFORM" }),
    res,
    next
  );
  assert.ok(called, "platform admin should be allowed without tenant");
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload, null);

  called = false;
  res = createRes();
  authorizeAskHawk(
    mockReq({}, {}, {}, { user: { role: "admin", email: "hawkeye-admin@test.com" }, adminScope: "NONE" }),
    res,
    next
  );
  assert.ok(called, "hawkeye admin email should be allowed without tenant");
  assert.equal(res.statusCode, 200);

  called = false;
  res = createRes();
  const platformReq = mockReq(
    { tenantId: "__platform__", role: "admin" },
    {},
    {},
    { tenantId: "t1", user: { role: "admin", email: "hawkeye-admin@test.com" }, adminScope: "NONE" }
  );
  authorizeAskHawk(platformReq, res, next);
  assert.ok(called, "platform admin should bypass tenant mismatch guard");
  assert.equal(res.statusCode, 200);
  assert.equal(platformReq.askContext?.tenantId, "__platform__");
};

run();
