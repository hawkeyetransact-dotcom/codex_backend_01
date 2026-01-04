#!/usr/bin/env node
import dotenv from "dotenv";
import mongoose from "mongoose";
import KbArticle from "../src/models/kbArticleModel.js";
import KbChunk from "../src/models/kbChunkModel.js";
import HawkPolicy from "../src/models/hawkPolicyModel.js";
import HawkPlaybook from "../src/models/hawkPlaybookModel.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI missing");
  process.exit(1);
}

const tenantId = "demo-tenant";
const role = "AUDITOR";
const productArea = "audit_workflow";

const articles = [
  { title: "How to request an audit", summary: "Steps to raise an audit request and assign roles", tags: ["request", "audits", "workflow"] },
  { title: "Audit scheduling best practices", summary: "Calendar, timezone, buffers, reminders", tags: ["scheduling", "calendar"] },
  { title: "Pre-audit document checklist", summary: "Evidence types, formats, pre-read", tags: ["checklist", "evidence"] },
  { title: "Supplier onboarding for audits", summary: "Invite suppliers, set expectations, SLAs", tags: ["supplier", "onboarding"] },
  { title: "Questionnaire auto-fill tips", summary: "Use templates, evidence links, AI assist", tags: ["questionnaire", "auto-fill"] },
  { title: "Flagging observations and severity", summary: "Minor vs Major vs Critical guidance", tags: ["observations", "severity"] },
  { title: "Creating CAPAs from issues", summary: "Escalation path to CAPA and ownership", tags: ["capa", "issues"] },
  { title: "Reviewing supplier responses", summary: "What to check before accepting", tags: ["review", "supplier"] },
  { title: "Report drafting flow", summary: "Generate draft, edit, sign, share", tags: ["report", "signoff"] },
  { title: "Digital signatures and audit trail", summary: "Signature order, blockchain anchor", tags: ["signature", "compliance"] },
  { title: "Notifications and reminders", summary: "Who gets notified and when", tags: ["notifications"] },
  { title: "Multi-tenant data isolation", summary: "TenantOrgId rules for queries", tags: ["tenant", "security"] },
  { title: "RBAC for Hawkeye", summary: "Roles, permissions, scopes", tags: ["rbac", "security"] },
  { title: "Issue classification examples", summary: "Sample wordings for Minor/Major/Critical", tags: ["observations"] },
  { title: "Evidence collection guide", summary: "Supported formats and naming", tags: ["evidence"] },
  { title: "Audit closeout checklist", summary: "Final steps before closing", tags: ["closeout"] },
  { title: "Working with FDA data", summary: "Using FDA dashboard insights", tags: ["fda", "insights"] },
  { title: "Handling overdue CAPAs", summary: "Escalation paths and reminders", tags: ["capa", "overdue"] },
  { title: "Report distribution rules", summary: "Who can view and download reports", tags: ["report", "distribution"] },
  { title: "Auditor-to-supplier comms", summary: "Tone, clarity, timelines", tags: ["communication"] },
];

const chunkText = (text) => {
  const parts = text.match(/.{1,320}/g) || [text];
  return parts;
};

const main = async () => {
  await mongoose.connect(MONGO_URI);
  await Promise.all([KbArticle.deleteMany({ tenantId }), KbChunk.deleteMany({ tenantId }), HawkPolicy.deleteMany({ tenantId }), HawkPlaybook.deleteMany({ tenantId })]);

  const created = [];
  for (const art of articles) {
    const slug = art.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const article = await KbArticle.create({
      tenantId,
      role,
      productArea,
      tags: art.tags,
      title: art.title,
      slug,
      summary: art.summary,
      source: "seed",
    });
    const chunks = chunkText(`${art.title}. ${art.summary}. Use Hawkeye workflow: request -> assign -> questionnaire -> evidence -> observations -> CAPA -> report -> sign.`).map((content, idx) => ({
      tenantId,
      role,
      productArea,
      tags: art.tags,
      articleId: article._id,
      chunkOrder: idx,
      content,
      embedding: [],
    }));
    await KbChunk.insertMany(chunks);
    created.push(article);
  }

  await HawkPolicy.create({
    tenantId,
    role: "BUYER",
    productArea,
    tags: ["policy", "approval"],
    title: "Audit approval policy",
    body: "All audits require buyer approval before scheduling. SLAs: respond within 2 business days.",
  });

  await HawkPlaybook.create({
    tenantId,
    role: "AUDITOR",
    productArea,
    tags: ["playbook", "issue"],
    title: "Issue to CAPA playbook",
    steps: [
      "Review supplier response",
      "If risk >= major, escalate to CAPA",
      "Assign owner and due date",
      "Track updates weekly",
      "Close after evidence verified",
    ],
    summary: "Convert issues to CAPAs when risk warrants; enforce ownership and evidence.",
  });

  console.log(`Seeded ${created.length} KB articles for tenant ${tenantId}`);
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
