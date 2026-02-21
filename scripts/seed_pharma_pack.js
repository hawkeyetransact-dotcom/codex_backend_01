import fs from "fs";
import path from "path";
import "../src/config/loadEnv.js";
import { connectDatabase } from "../src/config/database.js";
import { Pack } from "../src/models/packModel.js";

const loadJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8"));

const resolveTemplateKey = (definition = {}, fallbackPath = "") => {
  if (definition?.key) {
    const parts = String(definition.key).split(".");
    return parts[parts.length - 1] || String(definition.key);
  }
  return path.basename(fallbackPath, ".json");
};

const run = async () => {
  const packRoot = path.join(process.cwd(), "packs", "pharma_audit");
  const manifestPath = path.join(packRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest = loadJson(manifestPath);
  const templatePaths = Array.isArray(manifest.templates) ? manifest.templates : [];
  const templates = templatePaths.map((relativePath) => {
    const fullPath = path.join(packRoot, relativePath);
    const definition = loadJson(fullPath);
    return {
      key: resolveTemplateKey(definition, fullPath),
      name: definition.name || resolveTemplateKey(definition, fullPath),
      description: definition.description || "",
      definition,
    };
  });

  await connectDatabase();

  const doc = await Pack.findOneAndUpdate(
    { key: manifest.key, version: manifest.version },
    {
      $set: {
        key: manifest.key,
        version: manifest.version,
        name: manifest.name,
        description: manifest.description || "",
        industry: manifest.industry || "Pharma",
        status: "ACTIVE",
        templates,
        nodeTypes: Array.isArray(manifest.nodeTypes) ? manifest.nodeTypes : [],
        skills: Array.isArray(manifest.skills) ? manifest.skills : [],
        validators: Array.isArray(manifest.validators) ? manifest.validators : [],
        uiWidgets: Array.isArray(manifest.uiWidgets) ? manifest.uiWidgets : [],
      },
    },
    { new: true, upsert: true }
  );

  console.log(
    `Pharma pack seeded: ${doc.key}@${doc.version} with ${doc.templates.length} templates.`
  );
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

