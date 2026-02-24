const TEMPLATE_ID = 7;
const YES_NO = ["Yes", "No"];

const normalizeQuestionText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[\W_]+/g, "")
    .trim();

const toCategoryId = (categoryName) =>
  `template7_${String(categoryName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;

const toQuestionId = (code) =>
  `template7_${String(code || "")
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
  q("FP.2", "Material name", "First Page", "text"),
  q("FP.3", "Reference", "First Page", "text"),
  q("FP.4", "We confirm to supply the material as per your specifications.", "First Page", "radio", YES_NO),
  q("FP.5", "Consignment will be accompanied with certificate of analysis.", "First Page", "radio", YES_NO),
  q(
    "FP.6",
    "We are not using any material of animal origin in our process, and will provide certificate stating material is free from TSE and BSE.",
    "First Page",
    "radio",
    YES_NO
  ),
  q("FP.7", "We will provide our method of analysis.", "First Page", "radio", YES_NO),
  q(
    "FP.8",
    "We will provide working standard, reference standard, impurities standard, and stability data whenever required.",
    "First Page",
    "radio",
    YES_NO
  ),
  q("FP.9", "We will depute our representative to discuss with you, if required.", "First Page", "radio", YES_NO),
  q(
    "FP.10",
    "Any change in manufacturing process or facility will be obtained from you for approval.",
    "First Page",
    "radio",
    YES_NO
  ),
  q(
    "FP.11",
    "The material will not be manufactured at any other subcontractor premises.",
    "First Page",
    "radio",
    YES_NO
  ),
  q("FP.12", "Vendor name and designation", "First Page", "text"),
  q("FP.13", "Vendor signature", "First Page", "text"),
  q("FP.14", "Vendor signature date", "First Page", "date"),
  q("FP.15", "Name of Vendor Company", "First Page", "text"),
  q("FP.16", "Full street address", "First Page", "textarea"),
  q("FP.17", "Telephone number", "First Page", "text"),
  q("FP.18", "Fax number", "First Page", "text"),
  q("FP.19", "Manufacturing site (if different from above address)", "First Page", "textarea"),
  q("FP.20", "Manufacturing site telephone number", "First Page", "text"),
  q("FP.21", "Manufacturing site fax number", "First Page", "text"),
  q("FP.22", "Contact person for technical matter (Name, Dept, Function, Tel.)", "First Page", "text"),
  q("FP.23", "Contact person for commercial matter (Name, Dept, Function, Tel.)", "First Page", "text"),
  q("FP.24", "Location in-charge / person responsible for Quality Assurance (Name, Dept, Function, Tel.)", "First Page", "text"),
  q("FP.25", "Material purchased or to be purchased", "First Page", "text"),
  q("FP.26", "Questionnaire filled by", "First Page", "text"),
  q("FP.27", "Function", "First Page", "text"),
  q("FP.28", "Questionnaire date", "First Page", "date"),
  q("FP.29", "Questionnaire signature", "First Page", "text"),
];

const generalInformationQuestions = [
  q("1.1", "Total area of the site", "General Information", "text"),
  q("1.2", "Total constructed area", "General Information", "text"),
  q("1.3", "Surrounding types of industries on the four sides of the site", "General Information", "textarea"),
  q("1.4", "Number of employees in production", "General Information", "number"),
  q("1.5", "Number of employees in QC/QA", "General Information", "number"),
  q("1.6", "Number of employees in R and D", "General Information", "number"),
  q("1.7", "Source of water", "General Information", "text"),
  q(
    "1.8",
    "Water treatment facilities (please tick relevant method followed)",
    "General Information",
    "checkbox",
    ["Reverse osmosis", "Chemical treatment", "Distillation", "Deionisation"]
  ),
  q("1.9", "Test protocols for the water", "General Information", "checkbox", ["Chemical", "Bacteriological"]),
  q(
    "1.10",
    "Do you possess any of the following certificates?",
    "General Information",
    "checkbox",
    ["Local authority GMP Certificate", "ISO 9000", "WHO GMP Certificate", "Other"]
  ),
  q("1.11", "Any health authority has audited the facility", "General Information", "radio", YES_NO),
  q(
    "1.12",
    "Is your facility approved by any of the mentioned authorities?",
    "General Information",
    "checkbox",
    ["US FDA", "UK MHRA", "Any other"]
  ),
  q("1.13", "List of machinery and testing equipment", "General Information", "textarea"),
  q("1.14", "Can your facility be audited by MEDLEY PHARMA personnel?", "General Information", "radio", YES_NO),
  q("1.15", "List of products manufactured by you", "General Information", "textarea"),
  q(
    "1.16",
    "Has a DMF/Dossier been deposited with any health authorities? If yes, provide DMF/Dossier numbers and countries where deposited.",
    "General Information",
    "radio",
    YES_NO
  ),
  q(
    "1.17",
    "Has your DMF/Dossier been assessed in the mentioned countries? If yes, specify.",
    "General Information",
    "radio",
    YES_NO
  ),
  q(
    "1.18",
    "Are other products manufactured besides active pharmaceutical ingredients (APIs) at the same site as APIs?",
    "General Information",
    "radio",
    YES_NO
  ),
  q(
    "1.19",
    "Which of the following product categories are produced in the same site? (If yes, specify product names.)",
    "General Information",
    "checkbox",
    ["Antibiotics", "Cytotoxics", "Hormones", "Vaccines / sera", "Biological"]
  ),
  q("1.20", "Are the products being produced using the same manufacturing equipment?", "General Information", "radio", YES_NO),
  q(
    "1.21",
    "Has the company been inspected by FDA or any other organisation/authority/government control center? If yes, when was the last time?",
    "General Information",
    "textarea"
  ),
  q("1.22", "Is there a program for self-inspection?", "General Information", "radio", YES_NO),
  q("1.23", "Are material safety data sheets (MSDS) available for all commercially distributed products?", "General Information", "radio", YES_NO),
  q(
    "1.24",
    "Can you provide impurities reference standards and degradation products for the raw material together with certificate of analysis?",
    "General Information",
    "radio",
    YES_NO
  ),
];

const organizationQuestions = [
  q(
    "2.1",
    "Is there a quality control/assurance department responsible for approval/rejection of products, raw materials, intermediate products, containers, and labels?",
    "Organization and Personnel",
    "radio",
    YES_NO
  ),
  q("2.2", "Is there a training programme for employees?", "Organization and Personnel", "radio", YES_NO),
  q("2.3", "Is there a laid down medical checkup programme for employees?", "Organization and Personnel", "radio", YES_NO),
  q("2.4", "Name the functions responsible for batch release and product specifications.", "Organization and Personnel", "textarea"),
];

const technicalQuestions = [
  q("3.1", "Record for receipt and issue of material", "Technical Information", "radio", YES_NO),
  q("3.2", "Is each incoming lot given a separate company control/lot number and how is this organized?", "Technical Information", "radio", YES_NO),
  q("3.3", "Is FIFO or FEFO system practiced?", "Technical Information", "radio", YES_NO),
  q("3.4", "Batch manufacturing record", "Technical Information", "radio", YES_NO),
  q("3.5", "Specifications of raw materials and finished product", "Technical Information", "radio", YES_NO),
  q("3.6", "Test methods", "Technical Information", "radio", YES_NO),
  q("3.7", "Master manufacturing and control record", "Technical Information", "radio", YES_NO),
  q("3.8", "SOPs for process, cleaning, change-over documentation, and related activities", "Technical Information", "radio", YES_NO),
  q("3.9", "Is there a change control system?", "Technical Information", "radio", YES_NO),
  q("3.10", "Is there a system to inform buyer for changes in process, equipment, or specification?", "Technical Information", "radio", YES_NO),
  q("3.11", "Are records for testing at different stages and finished products maintained?", "Technical Information", "radio", YES_NO),
  q("3.12", "Are records archived for easy retrieval?", "Technical Information", "radio", YES_NO),
  q("3.13", "Is there a complaint handling system?", "Technical Information", "radio", YES_NO),
  q(
    "3.14",
    "Incoming materials stored in area common to other raw materials used at the plant (mark applicable)",
    "Technical Information",
    "checkbox",
    [
      "Bulk drug substance",
      "Cosmetic ingredients",
      "Steroids",
      "Food / Nutritional ingredients",
      "Antibiotics (Others)",
      "Pesticides / Herbicides",
      "Other chemicals",
    ]
  ),
  q("3.15", "Is there a standard operating procedure for handling re-test and failures?", "Technical Information", "radio", YES_NO),
  q("3.16", "Are raw materials sampled/dispensed in designated sample rooms?", "Technical Information", "radio", YES_NO),
  q("3.17", "Are reserve samples of product kept?", "Technical Information", "radio", YES_NO),
  q("3.18", "Describe measures to prevent contamination during sampling.", "Technical Information", "textarea"),
  q("3.19", "Describe precautions to prevent contamination during weighing or dispensing.", "Technical Information", "textarea"),
  q("3.20", "Are reserve samples of raw materials kept?", "Technical Information", "radio", YES_NO),
  q("3.21", "Actions taken to ensure previous production is cleared before new production commences.", "Technical Information", "textarea"),
  q("3.22", "Are all finished products tested? If no, what percentage is tested?", "Technical Information", "textarea"),
  q("3.23", "Are all raw materials received tested? If no, what percentage is tested?", "Technical Information", "textarea"),
  q("3.24", "Are production equipment qualified?", "Technical Information", "radio", YES_NO),
  q("3.25", "Is preventive maintenance practiced?", "Technical Information", "radio", YES_NO),
  q("3.26", "Are there written procedures covering pest control?", "Technical Information", "radio", YES_NO),
  q("3.27", "Are all weighing and dispensing operations recorded?", "Technical Information", "radio", YES_NO),
  q("3.28", "List of companies who audited and approved your facility.", "Technical Information", "textarea"),
  q("3.29", "Any additional comments in relation to this questionnaire.", "Technical Information", "textarea"),
];

const productQuestions = [
  q("4.1", "Name of the product", "Product Information", "text"),
  q("4.2", "How long have you been manufacturing this material?", "Product Information", "text"),
  q("4.3", "Describe your batch coding system.", "Product Information", "textarea"),
  q("4.4", "Is it a continuous process or batch process?", "Product Information", "radio", ["Continuous process", "Batch process"]),
  q("4.5", "What is the batch size?", "Product Information", "text"),
  q("4.6", "What is the manufacturing capacity of the product?", "Product Information", "text"),
  q("4.7", "What is the capacity utilization?", "Product Information", "text"),
  q("4.8", "Describe steps involved from receipt of order to final dispatch.", "Product Information", "textarea"),
  q("4.9", "Packing details (size and type).", "Product Information", "textarea"),
  q("4.10", "Are production areas sufficiently separated to prevent cross-contamination and mix-ups?", "Product Information", "radio", YES_NO),
  q("4.11", "Is enough room available for equipment and material?", "Product Information", "radio", YES_NO),
  q("4.12", "If same equipment is used for different products, describe controls.", "Product Information", "textarea"),
  q("4.12.1", "Sufficient cleaning procedures are available.", "Product Information", "radio", YES_NO),
  q("4.12.2", "Are cleaning procedures validated?", "Product Information", "radio", YES_NO),
  q("4.12.3", "Do you perform cleaning validation?", "Product Information", "radio", YES_NO),
  q("4.12.4", "How do you prevent cross contamination?", "Product Information", "textarea"),
  q("4.13", "Provide product specification, analytical method, synthesis method, impurities, and degradation products.", "Product Information", "textarea"),
  q("4.14", "Can you supply all impurities/degradation product standards mentioned above?", "Product Information", "radio", YES_NO),
  q("4.15", "Provide stability details with stability-indicating method.", "Product Information", "textarea"),
  q("4.16", "Provide labeling details including shelf life and storage condition.", "Product Information", "textarea"),
  q("4.17", "Are access to and administration of labels limited?", "Product Information", "radio", YES_NO),
  q("4.18", "Are different labels used for each batch/lot and carefully checked?", "Product Information", "radio", YES_NO),
  q("4.19", "Does repacking take place in a separate area to prevent cross-contamination and mix-up?", "Product Information", "radio", YES_NO),
  q("4.20", "Seal integrity measures adopted during transit.", "Product Information", "textarea"),
  q("4.21", "Are there written procedures for production and in-process control?", "Product Information", "radio", YES_NO),
  q("4.22", "Are deviations documented in manufacturing records?", "Product Information", "radio", YES_NO),
  q("4.23", "Are there written specifications for in-process controls?", "Product Information", "radio", YES_NO),
  q("4.24", "Are rework and reprocessing procedures approved prior to execution?", "Product Information", "radio", YES_NO),
  q("4.25", "Do master formula and batch records contain details about equipment used?", "Product Information", "radio", YES_NO),
  q("4.26", "Have manufacturing processes been validated?", "Product Information", "radio", YES_NO),
  q("4.28", "Are cleaned equipment and machinery protected from contamination?", "Product Information", "radio", YES_NO),
  q(
    "4.29",
    "Confirm method/facility/process does not use any raw materials of animal origin (certificate attached).",
    "Product Information",
    "radio",
    YES_NO
  ),
  q("4.30", "Can you meet MEDLEY PHARMA specification as attached?", "Product Information", "textarea"),
  q("4.31", "List companies to whom you supply this material.", "Product Information", "textarea"),
  q("4.32", "List companies who audited and approved you to supply this material.", "Product Information", "textarea"),
  q("4.33", "Any other information you would like to provide.", "Product Information", "textarea"),
];

const laboratoryQuestions = [
  q("5.1", "Is laboratory equipment calibrated and documented as per written specifications?", "Laboratories", "radio", YES_NO),
  q("5.2", "Is each batch/lot tested and approved for release as per written procedures/specifications?", "Laboratories", "radio", YES_NO),
  q("5.3", "Are non-conforming products rejected and discrepancy reasons documented?", "Laboratories", "radio", YES_NO),
  q("5.4", "Is laboratory work documented and traceable?", "Laboratories", "radio", YES_NO),
  q("5.5", "Do all products bear expiration date?", "Laboratories", "radio", YES_NO),
  q("5.6", "Are contract laboratories used to perform testing?", "Laboratories", "radio", YES_NO),
  q("5.7", "Have laboratory staff been trained in cGMP and job procedures with documented evidence?", "Laboratories", "radio", YES_NO),
];

const allTemplate7Questions = [
  ...firstPageQuestions,
  ...generalInformationQuestions,
  ...organizationQuestions,
  ...technicalQuestions,
  ...productQuestions,
  ...laboratoryQuestions,
];

let cached = null;

export const getTemplate7CuratedQuestions = () => {
  if (cached) return cached;
  const nowIso = new Date().toISOString();
  cached = allTemplate7Questions.map((entry, index) => {
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

