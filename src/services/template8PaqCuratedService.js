const TEMPLATE_ID = 8;
const YES_NO = ["Yes", "No"];

const normalizeQuestionText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[\W_]+/g, "")
    .trim();

const toCategoryId = (categoryName) =>
  `template8_${String(categoryName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;

const toQuestionId = (code) =>
  `template8_${String(code || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;

const toResponseSchema = (answerType, options = [], helperText = "") => ({
  type: answerType || "text",
  options: (Array.isArray(options) ? options : []).map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  ),
  helperText: helperText || "",
  placeholder: "",
  commentPlaceholder: "",
  required: false,
  validation: {},
  layout: {},
  subQuestions: [],
});

const q = (code, question, categoryName, answerType = "text", options = [], helperText = "") => ({
  code,
  question,
  categoryName,
  answerType,
  options,
  helperText,
});

const firstPageQuestions = [
  q("FP.1", "Date", "First Page", "date"),
  q("FP.2", "Material Name", "First Page", "text"),
  q("FP.3", "Reference", "First Page", "text"),
  q("FP.4", "We confirm to supply the material as per your specifications.", "First Page", "radio", YES_NO),
  q("FP.5", "Consignment will be accompanied with certificate of analysis.", "First Page", "radio", YES_NO),
  q("FP.6", "We will provide our method of analysis.", "First Page", "radio", YES_NO),
  q("FP.7", "We will depute our representative to discuss with you, if required.", "First Page", "radio", YES_NO),
  q(
    "FP.8",
    "Any change in manufacturing process or facility will be obtained from you for approval.",
    "First Page",
    "radio",
    YES_NO
  ),
  q(
    "FP.9",
    "The material will not be manufactured at any other subcontractor premises.",
    "First Page",
    "radio",
    YES_NO
  ),
  q("FP.10", "Vendor name and designation", "First Page", "text"),
  q("FP.11", "Vendor signature", "First Page", "text"),
  q("FP.12", "Vendor signature date", "First Page", "date"),
  q("FP.13", "Name of Vendor Company", "First Page", "text"),
  q("FP.14", "Full Street Address", "First Page", "textarea"),
  q("FP.15", "Telephone Number", "First Page", "text"),
  q("FP.16", "Fax Number", "First Page", "text"),
  q("FP.17", "Manufacturing Site (if different from above address)", "First Page", "textarea"),
  q("FP.18", "Manufacturing Site Telephone Number", "First Page", "text"),
  q("FP.19", "Manufacturing Site Fax Number", "First Page", "text"),
  q("FP.20", "Contact Person for Technical Matter (Name, Dept, Function, Tel.)", "First Page", "text"),
  q("FP.21", "Contact Person for Commercial Matter (Name, Dept, Function, Tel.)", "First Page", "text"),
  q("FP.22", "Location In-charge / Person responsible for Quality Assurance (Name, Dept, Function, Tel.)", "First Page", "text"),
  q("FP.23", "Material purchased or to be purchased", "First Page", "text"),
  q("FP.24", "Questionnaire filled by", "First Page", "text"),
  q("FP.25", "Function", "First Page", "text"),
  q("FP.26", "Questionnaire date", "First Page", "date"),
  q("FP.27", "Questionnaire signature", "First Page", "text"),
];

const generalInformationQuestions = [
  q("1.1", "Total Area of the Site", "General Information", "text"),
  q("1.2", "Total Constructed Area", "General Information", "text"),
  q("1.3", "Surrounding types of industries on the four sides of the site", "General Information", "textarea"),
  q("1.4", "Number of employees in production", "General Information", "number"),
  q("1.5", "Number of employees in QC/QA", "General Information", "number"),
  q("1.6", "Number of employees in R and D", "General Information", "number"),
  q(
    "1.7",
    "Do you possess any of the following certificates?",
    "General Information",
    "checkbox",
    ["Local Authority certificate", "ISO certificate", "Other"]
  ),
  q("1.8", "List of Machinery and Testing Equipment", "General Information", "textarea"),
  q(
    "1.9",
    "Can your facility be audited by personnel from Medley Pharmaceuticals Ltd.?",
    "General Information",
    "radio",
    YES_NO
  ),
  q("1.10", "List of products manufactured by you", "General Information", "textarea"),
  q(
    "1.11",
    "Has a DMF/Dossier been deposited with health authorities? If yes, provide DMF/Dossier numbers and countries.",
    "General Information",
    "textarea"
  ),
  q(
    "1.12",
    "Has your DMF/Dossier been assessed in the above mentioned countries? If yes, specify.",
    "General Information",
    "radio",
    YES_NO
  ),
  q(
    "1.13",
    "Are other packaging materials manufactured at the same site? If yes, specify types.",
    "General Information",
    "textarea"
  ),
  q(
    "1.14",
    "Has the company been inspected by FDA/authority/government control center? If yes, when was the last time?",
    "General Information",
    "textarea"
  ),
  q("1.15", "Is there a program for self-inspection?", "General Information", "radio", YES_NO),
  q(
    "1.16",
    "Are Material Safety Data Sheets (MSDS) available for all commercially distributed products?",
    "General Information",
    "radio",
    YES_NO
  ),
];

const organizationQuestions = [
  q(
    "2.1",
    "Is there a quality control/assurance department responsible for approval/rejection of products, raw materials, containers, and labels?",
    "Organization and Personnel",
    "radio",
    YES_NO
  ),
  q("2.2", "Is there a training programme for employees?", "Organization and Personnel", "radio", YES_NO),
  q("2.3", "Is there a laid down medical checkups programme for employees?", "Organization and Personnel", "radio", YES_NO),
  q("2.4", "Name functions responsible for batch release and product specifications.", "Organization and Personnel", "textarea"),
];

const technicalQuestions = [
  q("3.1", "Record for receipt and issue of material", "Technical Information", "radio", YES_NO),
  q("3.2", "Is each incoming lot given a separate company control/lot number and how is this organized?", "Technical Information", "radio", YES_NO),
  q("3.3", "Is FIFO system practiced?", "Technical Information", "radio", YES_NO),
  q("3.4", "Batch manufacturing record", "Technical Information", "radio", YES_NO),
  q("3.5", "Specifications of packaging materials", "Technical Information", "radio", YES_NO),
  q("3.6", "Test methods", "Technical Information", "radio", YES_NO),
  q("3.7", "SOPs for process/cleaning/change-over documentation and related activities", "Technical Information", "radio", YES_NO),
  q("3.8", "Is there a Change Control System?", "Technical Information", "radio", YES_NO),
  q("3.9", "Is there a system to inform buyer for process/equipment/specification changes?", "Technical Information", "radio", YES_NO),
  q("3.10", "Are records for testing at different stages and finished products maintained?", "Technical Information", "radio", YES_NO),
  q("3.11", "Are records archived for easy retrieval?", "Technical Information", "radio", YES_NO),
  q("3.12", "Is there a complaint handling system?", "Technical Information", "radio", YES_NO),
  q("3.13", "Is there a SOP for handling re-test and failures?", "Technical Information", "radio", YES_NO),
  q("3.14", "Are packing materials sampled/dispensed in designated sample rooms?", "Technical Information", "radio", YES_NO),
  q("3.15", "Are reserve samples of product kept?", "Technical Information", "radio", YES_NO),
  q("3.16", "Describe measures to prevent contamination during sampling.", "Technical Information", "textarea"),
  q("3.17", "Describe precautions to prevent contamination during weighing or dispensing.", "Technical Information", "textarea"),
  q("3.18", "Actions taken to ensure previous production is cleared before new production commences.", "Technical Information", "textarea"),
  q("3.19", "Are all finished products tested? If no, what percentage is tested?", "Technical Information", "textarea"),
  q("3.20", "Are all raw materials tested? If no, what percentage is tested?", "Technical Information", "textarea"),
  q("3.21", "Are equipment qualified?", "Technical Information", "radio", YES_NO),
  q("3.22", "Is preventive maintenance practiced?", "Technical Information", "radio", YES_NO),
  q("3.23", "Are there written procedures covering pest control?", "Technical Information", "radio", YES_NO),
  q("3.24", "Are all weighing and dispensing operations recorded?", "Technical Information", "radio", YES_NO),
  q("3.25", "List companies who audited and approved your facility.", "Technical Information", "textarea"),
  q("3.26", "Any additional comments related to this questionnaire.", "Technical Information", "textarea"),
];

const productQuestions = [
  q("4.1", "Name of the product", "Product Information", "text"),
  q("4.2", "How long are you manufacturing this material?", "Product Information", "text"),
  q("4.3", "Describe your batch coding system.", "Product Information", "textarea"),
  q("4.4", "Is it a continuous process or batch process?", "Product Information", "radio", ["Continuous process", "Batch process"]),
  q("4.5", "What is the batch size?", "Product Information", "text"),
  q("4.6", "What is the manufacturing capacity of the product?", "Product Information", "text"),
  q("4.7", "What is the capacity utilization?", "Product Information", "text"),
  q("4.8", "Describe steps involved from order receipt to final dispatch.", "Product Information", "textarea"),
  q("4.9", "Packing details (size and type).", "Product Information", "textarea"),
  q("4.10", "Are production areas sufficiently separated to prevent cross-contamination and mix-ups?", "Product Information", "radio", YES_NO),
  q("4.11", "Is enough room available for equipment and material?", "Product Information", "radio", YES_NO),
  q("4.12", "Are access to and administration of labels limited?", "Product Information", "radio", YES_NO),
  q("4.13", "Are different labels used for each batch/lot and carefully checked?", "Product Information", "radio", YES_NO),
  q("4.14", "Does repacking take place in separate area to prevent cross-contamination and mix-up?", "Product Information", "radio", YES_NO),
  q("4.15", "Are there written procedures for production and in-process control?", "Product Information", "radio", YES_NO),
  q("4.16", "Are deviations documented in manufacturing records?", "Product Information", "radio", YES_NO),
  q("4.17", "Are there written specifications for in-process controls?", "Product Information", "radio", YES_NO),
  q("4.18", "Are rework and reprocessing procedures approved prior to execution?", "Product Information", "radio", YES_NO),
  q("4.19", "Do Master Formula and Batch Records contain details about equipment used?", "Product Information", "radio", YES_NO),
  q(
    "4.20",
    "Checking of production data includes (Identity of product, Correct packaging, Control of batch records, Notification forms for deviations, In-process results).",
    "Product Information",
    "checkbox",
    ["Identity of the product", "Correct packaging", "Control of batch records", "Notification forms for deviations", "In-process results"]
  ),
  q("4.21", "Have manufacturing processes been validated?", "Product Information", "radio", YES_NO),
  q("4.22", "Are cleaned equipment and machinery protected from contamination (dust, etc.)?", "Product Information", "radio", YES_NO),
  q("4.23", "Can you meet MEDLEY PHARMA specification as attached?", "Product Information", "textarea"),
  q("4.24", "Confirm virgin material used for manufacturing of primary packing materials.", "Product Information", "radio", ["Yes", "No", "NA"]),
  q("4.25", "List companies to whom you supply this material.", "Product Information", "textarea"),
  q("4.26", "List companies who audited and approved you to supply this material.", "Product Information", "textarea"),
  q("4.27", "Any other information you would like to provide.", "Product Information", "textarea"),
];

const laboratoryQuestions = [
  q("5.1", "Are laboratory instruments calibrated and documented as per written specifications?", "Laboratories", "radio", YES_NO),
  q("5.2", "Is each batch/lot of packing material tested and approved for release per written procedures/specifications?", "Laboratories", "radio", YES_NO),
  q("5.3", "Are products that do not fulfill specifications rejected and discrepancy reasons documented?", "Laboratories", "radio", YES_NO),
  q("5.4", "Is laboratory work documented and traceable?", "Laboratories", "radio", YES_NO),
  q("5.5", "Are contract laboratories used to perform testing?", "Laboratories", "radio", YES_NO),
  q("5.6", "Have laboratory staff been trained in cGMP and job procedures with documented evidence?", "Laboratories", "radio", YES_NO),
];

const allTemplate8Questions = [
  ...firstPageQuestions,
  ...generalInformationQuestions,
  ...organizationQuestions,
  ...technicalQuestions,
  ...productQuestions,
  ...laboratoryQuestions,
];

let cached = null;

export const getTemplate8CuratedQuestions = () => {
  if (cached) return cached;
  const nowIso = new Date().toISOString();
  cached = allTemplate8Questions.map((entry, index) => {
    const questionCode = String(entry.code);
    const categoryName = String(entry.categoryName || "Pre-Audit Questionnaire");
    const answerType = String(entry.answerType || "text");
    const options = Array.isArray(entry.options) ? entry.options : [];
    return {
      _id: toQuestionId(questionCode),
      questionCode,
      question: entry.question,
      categoryName,
      subCategoryName: "",
      templateId: TEMPLATE_ID,
      categoryId: toCategoryId(categoryName),
      riskcategory: "",
      Audittype: "",
      industry: "",
      Physical: "Y",
      createdAt: nowIso,
      updatedAt: nowIso,
      answerType,
      options,
      helperText: entry.helperText || "",
      subQuestions: [],
      order: index + 1,
      normalizedQuestion: normalizeQuestionText(entry.question),
      extractionHints: {},
      answerMapping: {},
      responseSchema: toResponseSchema(answerType, options, entry.helperText || ""),
    };
  });
  return cached;
};

