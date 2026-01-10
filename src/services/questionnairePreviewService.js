import fs from "fs";
import path from "path";
import mammoth from "mammoth";

const TEMPLATE_DOC_MAP = {
  3: "Full PSCI SAQ & Audit Report Template for Core Suppliers, External Manufacturers, Component and Material Suppliers (WORD VERSION).docx",
};

const previewCache = new Map();

const normalizeLine = (line = "") => line.trim().replace(/\s+/g, " ");

export const normalizeQuestionText = (text = "") =>
  text
    .toLowerCase()
    .replace(/[\W_]+/g, "")
    .trim();

const shouldIgnoreLine = (line = "") => {
  const trimmed = normalizeLine(line);
  if (!trimmed) return true;
  const ignored = [
    "AUDITOR GUIDANCE",
    "Auditor Verification",
    "Please provide observations, details, comments and any supporting documents",
  ];
  return ignored.includes(trimmed);
};

const isQuestionNumber = (line = "") => /^\d+$/.test(line.trim());

const isPureYesNoLine = (line = "") => {
  const tokens = normalizeLine(line)
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return false;
  const allowed = new Set(["yes", "no", "na"]);
  return tokens.every((t) => allowed.has(t)) && tokens.includes("yes") && tokens.includes("no");
};

const extractYesNoOptions = (line = "") => {
  const tokens = normalizeLine(line)
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const options = [];
  if (tokens.includes("yes")) options.push("Yes");
  if (tokens.includes("no")) options.push("No");
  if (tokens.includes("na")) options.push("NA");
  return options;
};

const parseInlineYesNo = (line = "") => {
  const match = normalizeLine(line).match(/^(.*?)(Yes\s+No(?:\s+NA)?)$/i);
  if (!match) return null;
  const label = match[1]?.trim().replace(/[:\-]\s*$/, "");
  if (!label) return null;
  return { label, options: extractYesNoOptions(match[2]) };
};

const isCheckboxIntro = (line = "") =>
  /please indicate|select all|following are included|check all that apply/i.test(line);

const isLinkLine = (line = "") =>
  /web link|website|attach a copy|attachment|attach a copy of the policy/i.test(line);

const isCommentLine = (line = "") =>
  /^comments?:?/i.test(line) || /please explain/i.test(line);

const isNoteLine = (line = "") =>
  /^\*/.test(line) || /^note:|^please note/i.test(line);

export const buildDocBlocks = (lines = []) => {
  const blocks = [];
  let checkboxOptions = null;
  let yesNoIndex = 0;
  let checkboxIndex = 0;
  let textIndex = 0;
  let uploadIndex = 0;

  const pushYesNo = (data) => {
    yesNoIndex += 1;
    blocks.push({ type: "yesno", key: `yesno_${yesNoIndex}`, ...data });
  };

  const pushCheckboxes = (options) => {
    checkboxIndex += 1;
    blocks.push({ type: "checkboxes", key: `checkbox_${checkboxIndex}`, options });
  };

  const pushText = (data) => {
    textIndex += 1;
    blocks.push({ type: "text", key: `text_${textIndex}`, ...data });
  };

  const pushUpload = (data) => {
    uploadIndex += 1;
    blocks.push({ type: "upload", key: `upload_${uploadIndex}`, ...data });
  };

  const flushCheckbox = () => {
    if (checkboxOptions && checkboxOptions.length) {
      pushCheckboxes(checkboxOptions);
    }
    checkboxOptions = null;
  };

  const shouldStopCheckbox = (line) =>
    isLinkLine(line) || isCommentLine(line) || isNoteLine(line) || isPureYesNoLine(line) || !!parseInlineYesNo(line);

  lines.forEach((raw) => {
    const line = normalizeLine(raw);
    if (!line) return;

    if (checkboxOptions) {
      if (shouldStopCheckbox(line)) {
        flushCheckbox();
      } else {
        checkboxOptions.push(line);
        return;
      }
    }

    if (isPureYesNoLine(line)) {
      pushYesNo({ options: extractYesNoOptions(line) });
      return;
    }

    const inline = parseInlineYesNo(line);
    if (inline) {
      pushYesNo({ label: inline.label, options: inline.options });
      return;
    }

    if (isCheckboxIntro(line)) {
      blocks.push({ type: "instruction", text: line });
      checkboxOptions = [];
      return;
    }

    if (isLinkLine(line)) {
      blocks.push({ type: "instruction", text: line });
      pushText({ label: "Web link", placeholder: "Enter link" });
      pushUpload({ label: "Upload document" });
      return;
    }

    if (isCommentLine(line)) {
      pushText({ label: line.replace(/:$/, ""), multiline: true });
      return;
    }

    if (isNoteLine(line)) {
      blocks.push({ type: "helper", text: line, italic: true });
      return;
    }

    blocks.push({ type: "instruction", text: line });
  });

  flushCheckbox();
  return blocks;
};

export const extractQuestionBlocks = (lines = []) => {
  const questions = [];
  let current = null;
  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line) continue;
    if (isQuestionNumber(line)) {
      if (current?.question) {
        questions.push(current);
      }
      current = { number: Number(line), question: "", responseLines: [] };
      continue;
    }
    if (!current) continue;
    if (!current.question) {
      current.question = line;
      continue;
    }
    if (shouldIgnoreLine(line)) continue;
    current.responseLines.push(line);
  }
  if (current?.question) {
    questions.push(current);
  }
  return questions;
};

export const loadQuestionnairePreview = async (templateId) => {
  if (!templateId) return null;
  if (previewCache.has(templateId)) {
    return previewCache.get(templateId);
  }
  const docName = TEMPLATE_DOC_MAP[templateId];
  if (!docName) return null;
  const filePath = path.join(process.cwd(), "test", docName);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const lines = (result?.value || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const questions = extractQuestionBlocks(lines);
  const payload = { templateId, questions };
  previewCache.set(templateId, payload);
  return payload;
};
