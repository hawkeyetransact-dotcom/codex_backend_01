import multer from "multer";
import path from "path";
import { DocIntelService } from "../services/docIntelService.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

export const ingestUploadMiddleware = upload.single("file");

export const ingestEvidence = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "File is required" });
    const tenantId = req.tenantId;
    const userId = req.user?._id;
    const auditRequestId = req.body?.auditRequestId || req.query?.auditRequestId || null;
    const result = await DocIntelService.ingestPdf({ file: req.file, tenantId, uploaderId: userId, auditRequestId });
    res.json({
      success: true,
      data: {
        uploadId: result.upload._id,
        pageCount: result.upload.pageCount,
        pagesStored: result.pagesStored,
        fileSha256: result.upload.fileSha256,
        status: result.upload.status,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const saqCoverage = async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const topN = Number(req.body?.topN || 3) || 3;
    const auditRequestId = req.body?.auditRequestId;

    let data;
    if (auditRequestId) {
      data = await DocIntelService.coverageForAudit({ tenantId, auditRequestId, topN });
    } else {
      let templateDocxPath = req.body?.templateDocxPath || process.env.PSCI_TEMPLATE_PATH || "";
      if (!templateDocxPath) {
        return res.status(400).json({ error: "auditRequestId or templateDocxPath is required" });
      }
      if (!path.isAbsolute(templateDocxPath)) {
        templateDocxPath = path.join(process.cwd(), templateDocxPath);
      }
      data = await DocIntelService.coverageWithTemplate({ tenantId, templateDocxPath, topN });
    }

    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
