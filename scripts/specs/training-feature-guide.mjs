/**
 * Training Records — Feature Guide spec.
 */
export default {
  version: "1.1",
  moduleName: "Training Records",
  moduleFlag: "modules.TRAINING",
  modelFile: "backend/src/models/TrainingRecordModel.js",
  routes: ["/training (frontend)", "/api/training-records (backend)"],
  purpose: "Track assigned, in-progress and completed training for every employee. Auto-assign 'Read and Understood' records when SOPs publish. Capture competency assessment + knowledge-check results for audit readiness.",
  compliance: "ISO 9001:2015 §7.2 (competence) · 21 CFR 211.25 (personnel qualification) · 21 CFR 211.100 (training on SOPs) · EU GMP Chapter 2",
  overviewBody:
    "Records move ASSIGNED → IN_PROGRESS → COMPLETED (or OVERDUE / WAIVED / FAILED). The Wave 2 Training Auto-Assign agent fires when an SOP with requiresTrainingOnUpdate=true publishes — it identifies affected roles + creates a record per person + optionally drafts a knowledge-check question.",

  comparison: [
    { expectation: "Records cover all 21 CFR 211.25 training types (onboarding / SOP read-and-understand / regulatory / GMP / safety / technical / process / quality system)", standard: "21 CFR 211.25", hawkeye: "trainingType enum with 9 values matching CFR 211.25.", outcome: "met" },
    { expectation: "Auto-assign on SOP publish", standard: "21 CFR 211.100", hawkeye: "Wave 2 Training Auto-Assign agent fires from /publish hook when requiresTrainingOnUpdate=true.", outcome: "met" },
    { expectation: "Competency level recorded (Aware / Competent / Proficient / Expert)", standard: "ISO 9001 §7.2", hawkeye: "competencyLevel enum on /complete.", outcome: "met" },
    { expectation: "Assessment captured (type / score / passed)", standard: "21 CFR 211.25(a)", hawkeye: "assessment subdocument with assessmentType (WRITTEN_TEST/PRACTICAL/OBSERVATION/SIGN_OFF/ORAL_EXAM) + score + passed.", outcome: "met" },
    { expectation: "Due date + grace period tracking", standard: "21 CFR 211.25", hawkeye: "dueDate field; auto-assign uses gracePeriodDays.", outcome: "met" },
    { expectation: "OVERDUE escalation when dueDate passes", standard: "ISO 9001 §7.2(d)", hawkeye: "Vercel cron (03:00 UTC daily) calls /api/quality/scan-overdue → flips records past dueDate to OVERDUE + writes notification-outbox rows.", outcome: "met" },
    { expectation: "AI-drafted knowledge-check question per SOP rev", standard: "—", hawkeye: "Auto-assign agent optionally drafts an MCQ via Free Gemini.", outcome: "met" },
    { expectation: "Waiver flow with reason + waivedBy + waivedAt", standard: "21 CFR 211.25(c)", hawkeye: "WAIVED status + waiverReason + waivedBy fields.", outcome: "met" },
    { expectation: "21 CFR Part 11 e-signature on training completion", standard: "21 CFR Part 11", hawkeye: "Generic e-sig endpoint exists; not enforced on /complete today.", outcome: "partial", note: "Wire /api/electronic-signatures/sign on /complete" },
  ],

  personas: [
    { name: "Rebecca Kim", role: "Training Coordinator (admin)", email: "training.coord@novex-pharma.demo",
      responsibilities: "Assigns training, monitors compliance, processes waivers.", touches: ["ASSIGNED", "WAIVED", "FAILED"] },
    { name: "Trainees (any user)", role: "varies", email: "all 11 personas can be trainees", responsibilities: "Complete assigned trainings + assessment.", touches: ["IN_PROGRESS", "COMPLETED"] },
    { name: "Sarah O'Brien (Doc Control)", role: "admin · upstream", email: "doc.control@novex-pharma.demo",
      responsibilities: "Publishes SOPs that fire auto-assign.", touches: ["ASSIGNED (downstream of SOP publish)"] },
  ],

  features: [
    { name: "Training register",
      what: "Lists all training records with status filter + assignedTo + dueDate.",
      location: "/training",
      roles: ["any tenant viewer"],
      api: "GET /api/training-records",
      steps: [
        { kind: "navigate", label: "Click 'Training' in the top nav", expect: "Page renders" },
        { kind: "wait", label: "Spinner clears", expect: "Seeded rows visible: 2 COMPLETED for Kenji, 1 ASSIGNED for production head" },
      ],
      screenshot: "state-screens/training-list.png" },

    { name: "+ Assign Training dialog",
      what: "Manually assign a training to a user.",
      location: "/training · top-right '+ Assign Training' button",
      roles: ["admin · trainer"],
      api: "POST /api/training-records",
      steps: [
        { kind: "click", label: "Click '+ Assign Training'", expect: "Dialog opens" },
        { kind: "click", label: "Pick trainee from user dropdown", expect: "required" },
        { kind: "type", label: "Fill trainingCode (e.g. SOP-QC-014@v7.2)", expect: "required" },
        { kind: "type", label: "Fill trainingTitle", expect: "required" },
        { kind: "click", label: "Pick trainingType (SOP_READ_AND_UNDERSTAND / GMP / SAFETY / etc.)", expect: "required" },
        { kind: "click", label: "Pick dueDate", expect: "required" },
        { kind: "click", label: "Click 'Save'", expect: "Row appears with status=ASSIGNED" },
      ],
      fields: [
        { name: "traineeId", required: true, values: "ObjectId · user" },
        { name: "trainingCode", required: true, values: "string e.g. SOP-XXX@vN" },
        { name: "trainingTitle", required: true, values: "string" },
        { name: "trainingType", required: true, values: "ONBOARDING | SOP_READ_AND_UNDERSTAND | REGULATORY | GMP | SAFETY | TECHNICAL | PROCESS | QUALITY_SYSTEM | CUSTOM" },
        { name: "dueDate", required: true, values: "ISO date" },
      ] },

    { name: "Start training (ASSIGNED → IN_PROGRESS)",
      what: "Trainee marks the record as started.",
      location: "Training row · 'Start' button",
      roles: ["trainee (own record)"],
      api: "PUT /api/training-records/:id (status=IN_PROGRESS)",
      steps: [
        { kind: "click", label: "Click 'Start' on your assigned row", expect: "Status flips to IN_PROGRESS" },
      ] },

    { name: "Complete (with assessment)",
      what: "Captures competencyLevel + assessment + duration + (optional) e-signature.",
      location: "Training row · 'Mark Complete' button",
      roles: ["trainee"],
      api: "POST /api/training-records/:id/complete",
      steps: [
        { kind: "click", label: "Click 'Mark Complete'", expect: "Drawer with assessment form" },
        { kind: "click", label: "Pick competencyLevel (AWARE / COMPETENT / PROFICIENT / EXPERT)", expect: "required" },
        { kind: "click", label: "Pick assessment.type (WRITTEN_TEST / PRACTICAL / OBSERVATION / SIGN_OFF / ORAL_EXAM)", expect: "required" },
        { kind: "type", label: "Fill assessment.score + tick passed", expect: "required" },
        { kind: "type", label: "(Optional) Fill notes + trainingDurationMinutes", expect: "" },
        { kind: "click", label: "Click 'Submit'", expect: "Status=COMPLETED · completedAt set" },
      ] },

    { name: "Waive",
      what: "Trainer waives a training with reason (e.g. trainee already qualified elsewhere).",
      location: "Training row · 'Waive' button",
      roles: ["trainer · admin"],
      api: "PUT /api/training-records/:id (status=WAIVED, waiverReason, waivedBy, waivedAt)",
      steps: [
        { kind: "click", label: "Click 'Waive'", expect: "Drawer with waiverReason field" },
        { kind: "type", label: "Fill waiverReason", expect: "required" },
        { kind: "click", label: "Click 'Confirm waiver'", expect: "Status=WAIVED · terminal" },
      ] },

    { name: "AI · Training auto-assign on SOP rev (Wave 2)",
      what: "Fires automatically from doc-control /publish hook. Identifies affected roles + creates training-records + drafts knowledge-check.",
      location: "Auto-fired (no manual button); records appear in /training",
      roles: ["system (fired from SOP publish hook)"],
      api: "POST /api/ai/training/auto-assign",
      aiAssist: "Free Gemini for knowledge-check draft; rule engine for role mapping",
      steps: [
        { kind: "wait", label: "After an SOP with requiresTrainingOnUpdate=true publishes, wait ~5s", expect: "training-records inserted for users in affectedRoles + (optional) knowledgeCheck question on each record" },
      ] },
  ],

  lifecycleIntro: "One training record assigned, completed with assessment.",
  lifecycle: [
    { step: 1, persona: "Rebecca", role: "Training Coordinator", fromState: "—", toState: "ASSIGNED",
      action: "Click '+ Assign Training' → trainee=Rebecca, code=E2E-LC, type=SOP_READ_AND_UNDERSTAND, due=+14d → Save",
      api: "POST /api/training-records",
      observed: "Row visible with status=ASSIGNED", outcome: "pass",
      expectedDb: "training-records { _id, traineeId, trainingCode, trainingTitle, trainingType: 'SOP_READ_AND_UNDERSTAND', dueDate, status: 'ASSIGNED', assignedByUserId: rebecca._id }",
      screenshot: "state-screens/training-list.png" },
    { step: 2, persona: "Trainee (Rebecca)", role: "trainee", fromState: "ASSIGNED", toState: "IN_PROGRESS",
      action: "PUT status=IN_PROGRESS",
      api: "PUT /api/training-records/:id",
      observed: "Status flips", outcome: "pass",
      expectedDb: "training-records.status = 'IN_PROGRESS'" },
    { step: 3, persona: "Trainee", role: "trainee", fromState: "IN_PROGRESS", toState: "COMPLETED",
      action: "POST /complete with competencyLevel=COMPETENT + assessment {type: WRITTEN_TEST, score: 90, passed: true}",
      api: "POST /api/training-records/:id/complete",
      observed: "Status=COMPLETED · completedAt set", outcome: "pass",
      expectedDb: "training-records { status: 'COMPLETED', competencyLevel: 'COMPETENT', assessment: { assessmentType: 'WRITTEN_TEST', score: 90, passed: true }, completedAt: <now> }" },
  ],

  aiAssists: [
    { name: "Training Auto-Assign Agent (Wave 2)", attachedToStates: ["ASSIGNED (creation)"], endpoint: "POST /api/ai/training/auto-assign", where: "Auto-fired from doc-control /publish hook", what: "Identifies affected roles + creates training-records + (optional) drafts a knowledge-check MCQ", provider: "Free Gemini for question; rule engine for role mapping" },
    { name: "(roadmap) AI competency gap analyzer", attachedToStates: ["COMPLETED"], endpoint: "(future)", where: "Training Compliance dashboard", what: "Compares assessment scores across roles + flags individuals + topics for follow-up training", provider: "Free Gemini" },
  ],

  regulatorTrace: [
    { state: "ASSIGNED", citations: ["21 CFR 211.25(a)", "ISO 9001 §7.2(b)"], evidence: "trainee + trainingCode + trainingType + dueDate + assignedBy", records: "training-records" },
    { state: "COMPLETED", citations: ["21 CFR 211.25(a)", "21 CFR Part 11 §11.50"], evidence: "competencyLevel + assessment {type, score, passed} + completedAt + (e-sig when wired)", records: "training-records + (electronic-signatures)" },
    { state: "WAIVED", citations: ["21 CFR 211.25(c)"], evidence: "waiverReason + waivedBy + waivedAt", records: "training-records" },
  ],

  testResults: [
    { suite: "eqms-lifecycle.spec.ts · training", scope: "ASSIGNED → IN_PROGRESS → COMPLETED with assessment", outcome: "pass", evidence: "4/4 PASS · eqms-test-results-v2.pdf" },
    { suite: "eqms-cross-module.spec.ts · F2", scope: "Doc publish → AI auto-assign fires", outcome: "pass", evidence: "F2 step 3 PASS" },
  ],

  roadmap: [
    { title: "OVERDUE scheduler + notification", note: "Cron that flips status to OVERDUE when dueDate passes + emails trainee + manager.", priority: "HIGH" },
    { title: "Mandatory e-sig on /complete", note: "Wire /api/electronic-signatures/sign for trainee + (optional) supervisor sign-off.", priority: "HIGH" },
    { title: "Training matrix view (role × required SOPs)", note: "Compliance grid per role.", priority: "MEDIUM" },
    { title: "AI competency gap analyzer (Wave 3 roadmap)", note: "Compare scores across roles + recommend remedial training.", priority: "MEDIUM" },
  ],
};
