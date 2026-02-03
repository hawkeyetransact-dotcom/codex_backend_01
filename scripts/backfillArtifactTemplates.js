import 'dotenv/config';
import mongoose from 'mongoose';
import { AuditArtifact } from '../src/models/auditArtifactModel.js';
import { AuditRequestMaster } from '../src/models/auditRequestsMasterModel.js';
import { Template } from '../src/models/templateModel.js';
import { TemplateQuestions } from '../src/models/templateQuestionsModel.js';
import { resolveTemplateTypesForArtifact } from '../src/utils/templateDefaults.js';

const normalize = (value) => String(value || '').toUpperCase();

const isTemplateCompatible = ({ artifactType, template }) => {
  if (!template) return false;
  const normalizedArtifact = normalize(artifactType);
  const normalizedTemplateType = normalize(template.templateType);
  const normalizedTemplateArtifact = normalize(template.artifactType);
  const allowedTemplateTypes = resolveTemplateTypesForArtifact(normalizedArtifact);
  if (normalizedArtifact === 'EXECUTION_QUESTIONNAIRE') return true;
  if (normalizedTemplateType && allowedTemplateTypes.includes(normalizedTemplateType)) return true;
  if (normalizedArtifact === 'SCOPE' && ['SCOPE', 'AGENDA'].includes(normalizedTemplateArtifact)) return true;
  return normalizedTemplateArtifact === normalizedArtifact;
};

const computeNextTemplateId = async () => {
  const [maxTemplate, maxQuestion] = await Promise.all([
    Template.findOne().sort({ templateId: -1 }).select('templateId').lean(),
    TemplateQuestions.findOne().sort({ templateId: -1 }).select('templateId').lean()
  ]);
  const maxVal = Math.max(maxTemplate?.templateId || 0, maxQuestion?.templateId || 0);
  return maxVal + 1;
};

const findPublishedTemplate = async ({ artifactType, tenantId, assessmentTypeId }) => {
  const templateTypes = resolveTemplateTypesForArtifact(artifactType);
  if (!templateTypes.length) return null;
  const baseQuery = {
    status: 'PUBLISHED',
    $or: [
      { templateType: { $in: templateTypes } },
      { artifactType: normalize(artifactType) }
    ]
  };
  const tenantFilters = [];
  if (tenantId) {
    tenantFilters.push({ $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] });
  }
  if (assessmentTypeId) {
    tenantFilters.push({
      $or: [
        { assessmentTypeId },
        { assessmentTypeId: null },
        { assessmentTypeId: { $exists: false } }
      ]
    });
  }
  const query = tenantFilters.length ? { $and: [baseQuery, ...tenantFilters] } : baseQuery;
  const match = await Template.find(query).sort({ 'extractionConfig.defaultTemplate': -1, updatedAt: -1 }).lean();
  return match?.[0] || null;
};

const findPublishedTemplateAnyTenant = async ({ artifactType }) => {
  const templateTypes = resolveTemplateTypesForArtifact(artifactType);
  if (!templateTypes.length) return null;
  const query = {
    status: 'PUBLISHED',
    $or: [
      { templateType: { $in: templateTypes } },
      { artifactType: normalize(artifactType) }
    ]
  };
  const match = await Template.find(query).sort({ updatedAt: -1 }).lean();
  return match?.[0] || null;
};

const cloneTemplateForTenant = async ({ template, tenantId, newTemplateId }) => {
  const cloned = {
    ...template,
    _id: undefined,
    tenantId,
    templateId: newTemplateId,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  delete cloned._id;
  await Template.create(cloned);

  const questions = await TemplateQuestions.find({ templateId: template.templateId }).lean();
  if (questions.length) {
    const clonedQuestions = questions.map((q) => {
      const { _id, ...rest } = q;
      return { ...rest, templateId: newTemplateId };
    });
    await TemplateQuestions.insertMany(clonedQuestions);
  }
  return newTemplateId;
};

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(uri);

  const TARGET_TYPES = ['INTIMATION_LETTER', 'SCOPE', 'AGENDA'];
  const cursor = AuditArtifact.find({ artifactType: { $in: TARGET_TYPES } }).cursor();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let missingTemplate = 0;
  let cloned = 0;
  let nextTemplateId = await computeNextTemplateId();

  for await (const artifact of cursor) {
    scanned += 1;
    const audit = await AuditRequestMaster.findById(artifact.auditId)
      .select('assessmentTypeId tenantOrgId')
      .lean();
    const tenantId = artifact.tenantId || audit?.tenantOrgId || null;
    const assessmentTypeId = audit?.assessmentTypeId || null;

    let template = null;
    if (artifact.templateId) {
      template = await Template.findOne({ templateId: artifact.templateId }).lean();
    }

    if (artifact.templateId && isTemplateCompatible({ artifactType: artifact.artifactType, template }) && template?.status === 'PUBLISHED' && (!template?.tenantId || String(template.tenantId) === String(tenantId))) {
      skipped += 1;
      continue;
    }

    let chosenTemplate = await findPublishedTemplate({ artifactType: artifact.artifactType, tenantId, assessmentTypeId });

    if (!chosenTemplate) {
      const fallbackTemplate = await findPublishedTemplateAnyTenant({ artifactType: artifact.artifactType });
      if (!fallbackTemplate) {
        missingTemplate += 1;
        continue;
      }
      chosenTemplate = fallbackTemplate;
    }

    let resolvedTemplateId = chosenTemplate.templateId;
    if (tenantId && chosenTemplate.tenantId && String(chosenTemplate.tenantId) !== String(tenantId)) {
      resolvedTemplateId = await cloneTemplateForTenant({
        template: chosenTemplate,
        tenantId,
        newTemplateId: nextTemplateId++
      });
      cloned += 1;
    }

    await AuditArtifact.updateOne({ _id: artifact._id }, { $set: { templateId: resolvedTemplateId } });
    updated += 1;
  }

  console.log(JSON.stringify({ scanned, updated, skipped, missingTemplate, cloned }, null, 2));
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
