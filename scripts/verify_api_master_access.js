import process from "process";

const baseApi = process.env.API_BASE_URL || "https://apzg4nceg6.us-east-1.awsapprunner.com/api";
const email = process.env.TEST_EMAIL || "supplier1@test.com";
const password = process.env.TEST_PASSWORD || "Test@2026";

const toJson = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const main = async () => {
  console.log(`[verify_api_master_access] base=${baseApi}`);

  const loginRes = await fetch(`${baseApi}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await toJson(loginRes);
  if (!loginRes.ok) {
    console.error("[login] failed", loginRes.status, loginBody);
    process.exit(1);
  }

  const token = loginBody?.token;
  if (!token) {
    console.error("[login] missing token", loginBody);
    process.exit(1);
  }

  const lettersRes = await fetch(`${baseApi}/api-master/letters`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const lettersBody = await toJson(lettersRes);
  console.log("[api-master/letters]", lettersRes.status, lettersBody);

  const statusRes = await fetch(`${baseApi}/api-master/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const statusBody = await toJson(statusRes);
  console.log("[api-master/status]", statusRes.status, statusBody);
};

main().catch((err) => {
  console.error("[verify_api_master_access] error", err);
  process.exit(1);
});
