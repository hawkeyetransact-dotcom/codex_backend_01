import "../src/config/loadEnv.js";
import mongoose from "mongoose";
import Tenant from "../src/models/tenantModel.js";
import KbArticle from "../src/models/kbArticleModel.js";
import KbChunk from "../src/models/kbChunkModel.js";

const SOURCE = "feature_seed";
const PRODUCT_AREA = "feature_overview";
const ROLES = [
  "buyer",
  "auditor",
  "supplier",
  "supplierUser",
  "admin",
  "tenant_admin",
  "superadmin",
];

const features = [
  {
    title: "Audit lifecycle overview",
    summary: "End-to-end flow from request to closeout with clear ownership.",
    tags: ["workflow", "overview"],
    body: [
      "Hawkeye guides an audit from request to closeout with clear handoffs.",
      "- Buyer creates a request with product, site, and target date.",
      "- Auditor accepts, plans milestones, and prepares the questionnaire.",
      "- Supplier responds, attaches evidence, and submits.",
      "- Auditor reviews, requests follow-ups, or accepts responses.",
      "- CAPAs are created if findings require corrective action.",
      "- Report is drafted, reviewed, and signed.",
      "- Audit closes when all milestones and approvals are complete.",
    ].join("\n"),
  },
  {
    title: "Requesting a new audit",
    summary: "How buyers start an audit and set expectations.",
    tags: ["request", "buyer"],
    body: [
      "When a buyer raises a request, Hawkeye captures the essentials.",
      "- Select supplier, product, and site.",
      "- Set a realistic due date and preferred audit window.",
      "- Assign the auditor and confirm ownership.",
      "- The system creates a request ID and notifies the auditor.",
    ].join("\n"),
  },
  {
    title: "Roles and responsibilities",
    summary: "What each role owns during the audit workflow.",
    tags: ["roles", "ownership"],
    body: [
      "Hawkeye keeps responsibilities clear across teams.",
      "- Buyer: requests audits, confirms schedules, reviews outcomes.",
      "- Auditor: accepts requests, builds questionnaires, reviews responses.",
      "- Supplier admin: coordinates supplier responses and assignments.",
      "- Supplier users: answer assigned sections and provide evidence.",
      "- Admins: monitor all audits and resolve escalations.",
    ].join("\n"),
  },
  {
    title: "Milestones and timeline planning",
    summary: "Tracking progress with milestone ownership and ETAs.",
    tags: ["milestones", "timeline"],
    body: [
      "Milestones provide a shared timeline for each audit.",
      "- Each milestone has an owner and an ETA.",
      "- Auditors can update milestone timing as the audit evolves.",
      "- Status moves from not started to in progress to completed.",
      "- The final ETA should stay within the buyer's target window.",
    ].join("\n"),
  },
  {
    title: "Scheduling and availability",
    summary: "Aligning schedules using constraints and proposed slots.",
    tags: ["scheduling", "availability"],
    body: [
      "Scheduling balances buyer, auditor, and supplier availability.",
      "- Buyer sets the audit window and confirms a slot.",
      "- Auditor can place holds to reserve options.",
      "- Supplier accepts the proposed slot.",
      "- Notes and constraints keep expectations visible to all.",
    ].join("\n"),
  },
  {
    title: "Questionnaire setup and templates",
    summary: "Selecting templates and defining mandatory questions.",
    tags: ["questionnaire", "templates"],
    body: [
      "Questionnaires start with a template and can be refined per audit.",
      "- Choose a template that fits the audit scope.",
      "- Mark critical questions as mandatory.",
      "- Preview the draft before releasing to the supplier.",
      "- Follow-up questions can be flagged during review.",
    ].join("\n"),
  },
  {
    title: "Supplier response and evidence",
    summary: "How suppliers respond and attach documentation.",
    tags: ["supplier", "evidence"],
    body: [
      "Suppliers provide responses along with supporting documents.",
      "- Upload evidence to questions or attach to the audit.",
      "- Supplier users focus only on assigned sections.",
      "- Responses remain editable until submission.",
      "- Auditors see progress and completeness at a glance.",
    ].join("\n"),
  },
  {
    title: "Section assignments for supplier teams",
    summary: "Split questionnaire ownership across supplier users.",
    tags: ["assignments", "supplier"],
    body: [
      "Supplier admins can distribute questionnaire sections to their team.",
      "- Assign categories to supplier users or assign to yourself.",
      "- Assigned users only see their categories and can respond to them.",
      "- Each user submits their sections back to the supplier admin.",
      "- The supplier admin reviews and sends the full response to the auditor.",
    ].join("\n"),
  },
  {
    title: "DigiLocker evidence library",
    summary: "Central place to store audit evidence for reuse.",
    tags: ["digilocker", "evidence"],
    body: [
      "DigiLocker stores supplier evidence in one place.",
      "- Upload documents once and reuse them across audits.",
      "- Add document type, department, tags, and confidentiality.",
      "- Attach DigiLocker items to questionnaire questions.",
      "- Keep evidence organized for audits and follow-ups.",
    ].join("\n"),
  },
  {
    title: "API library and product master",
    summary: "Explore public API master data and map supplier products.",
    tags: ["api-library", "product"],
    body: [
      "API Library provides a public master list of APIs.",
      "- Search by API name or CAS.",
      "- Browse the list alphabetically.",
      "- Supplier admins can map products to the master list.",
      "- Master data helps standardize audits across suppliers.",
    ].join("\n"),
  },
  {
    title: "Follow-ups and observations",
    summary: "Handling flags, clarifications, and rework.",
    tags: ["followup", "observations"],
    body: [
      "Auditors can flag questions that need clarification.",
      "- Flagged items return to the supplier as follow-ups.",
      "- Supplier responses update the same workflow record.",
      "- The audit stays in review until follow-ups are resolved.",
    ].join("\n"),
  },
  {
    title: "Supplier submissions and handoff",
    summary: "How supplier users and admins complete the response.",
    tags: ["supplier", "handoff"],
    body: [
      "Supplier users submit assigned sections to the supplier admin.",
      "- The supplier admin reviews and finalizes the response.",
      "- The admin sends the audit response to the auditor.",
      "- Follow-up requests go to the assigned users first.",
    ].join("\n"),
  },
  {
    title: "CAPA management",
    summary: "Corrective actions tied to audit findings.",
    tags: ["capa", "issues"],
    body: [
      "CAPAs track corrective actions from audit findings.",
      "- Create a CAPA when risk requires a corrective plan.",
      "- Assign an owner and due date.",
      "- Update evidence and status until completion.",
      "- Close CAPAs after verification.",
    ].join("\n"),
  },
  {
    title: "Reports and sign-off",
    summary: "Drafting, reviewing, and signing audit reports.",
    tags: ["reports", "signoff"],
    body: [
      "Reports summarize findings, evidence, and outcomes.",
      "- Generate a draft report for review.",
      "- Auditor finalizes the content and signs.",
      "- Buyer and supplier can review shared results.",
      "- Signed reports form the audit record.",
    ].join("\n"),
  },
  {
    title: "Notifications and inbox",
    summary: "Who gets notified and when.",
    tags: ["notifications", "inbox"],
    body: [
      "Notifications keep work moving across teams.",
      "- Requests, assignments, and schedule changes trigger alerts.",
      "- Follow-ups and submissions notify the next owner.",
      "- Each user sees actionable updates in their inbox.",
    ].join("\n"),
  },
  {
    title: "AskHawk guidance",
    summary: "Contextual help for audit workflows and general questions.",
    tags: ["askhawk", "help"],
    body: [
      "AskHawk answers workflow and audit questions.",
      "- App-specific questions use the Hawkeye knowledge base.",
      "- General pharma audit questions receive guardrailed guidance.",
      "- Use AskHawk to learn steps, roles, and handoffs.",
    ].join("\n"),
  },
  {
    title: "Audit summary and admin visibility",
    summary: "Global visibility across tenants and audit IDs.",
    tags: ["summary", "admin"],
    body: [
      "Audit Summary provides the high-level view of every request.",
      "- See buyer, supplier, auditor, product, and site details.",
      "- Track status, due dates, and current owner.",
      "- Admins can view all request IDs and audit history.",
    ].join("\n"),
  },
];

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const chunkText = (text) => {
  const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  parts.forEach((part) => {
    if (part.length <= 420) {
      chunks.push(part);
      return;
    }
    for (let i = 0; i < part.length; i += 420) {
      chunks.push(part.slice(i, i + 420));
    }
  });
  return chunks;
};

const seedForTenantRole = async (tenantId, role) => {
  const existing = await KbArticle.find({ tenantId, role, source: SOURCE }).select("_id").lean();
  if (existing.length) {
    const articleIds = existing.map((a) => a._id);
    await KbChunk.deleteMany({ articleId: { $in: articleIds } });
    await KbArticle.deleteMany({ _id: { $in: articleIds } });
  }

  for (const feature of features) {
    const slug = `${tenantId}-${role}-${slugify(feature.title)}`;
    const article = await KbArticle.create({
      tenantId,
      role,
      productArea: PRODUCT_AREA,
      tags: feature.tags,
      title: feature.title,
      slug,
      summary: feature.summary,
      source: SOURCE,
    });

    const content = `${feature.title}. ${feature.summary}\n${feature.body}`;
    const chunks = chunkText(content).map((chunk, idx) => ({
      tenantId,
      role,
      productArea: PRODUCT_AREA,
      tags: feature.tags,
      articleId: article._id,
      chunkOrder: idx,
      content: chunk,
      embedding: [],
    }));
    if (chunks.length) {
      await KbChunk.insertMany(chunks);
    }
  }
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const tenants = await Tenant.find().select("_id name displayName").lean();
  if (!tenants.length) {
    console.log("No tenants found.");
    await mongoose.disconnect();
    return;
  }

  for (const tenant of tenants) {
    const tenantId = String(tenant._id);
    for (const role of ROLES) {
      await seedForTenantRole(tenantId, role);
    }
    console.log(`Seeded AskHawk features for ${tenant.displayName || tenant.name || tenantId}`);
  }

  await mongoose.disconnect();
  console.log("AskHawk KB features seeded.");
};

main().catch((err) => {
  console.error("seed_kb_features failed", err);
  process.exit(1);
});
