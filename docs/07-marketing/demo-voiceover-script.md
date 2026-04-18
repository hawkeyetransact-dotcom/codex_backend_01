# HawkEye EQMS Demo — AI Voiceover Script

**Duration:** ~10 minutes
**Two versions:** Male voice (Version A) / Female voice (Version B)
**Tone:** Professional, confident, warm. Not robotic.

---

## INTRO (0:00 - 0:30)

Welcome to HawkEye — the AI-powered quality management platform for pharmaceutical manufacturing.

In the next ten minutes, I'll walk you through how HawkEye handles a real-world quality event — from the moment an alarm goes off at 2 AM, through investigation, corrective action, document updates, and all the way to your quarterly management review.

Every click, every form, every status change you see is live on our platform. Let's begin.

---

## SCENE 1: DEVIATION (0:30 - 2:30)

It's 2 AM at PharmaCo's warehouse. The cold storage alarm triggers — the HVAC backup compressor has failed, and temperatures in Cold Room A have exceeded the acceptable range.

Raj, the warehouse operator, opens HawkEye on his phone. He navigates to the Deviation Manager and clicks "Report Deviation."

He fills in the details: Temperature excursion, Cold Room A. Classification: Major. Category: Environmental. He notes the immediate action — material has been moved to the backup cold room.

*[pause]*

The system auto-assigns a deviation number — DEV-2026-0026. Status: Reported.

Six hours later, Sarah, the QA Manager, arrives and assesses the impact. She selects batch disposition as "Quarantine" — the affected material won't enter production until stability retesting is complete.

Now she investigates the root cause using a 5-Why analysis. Why did the temperature rise? The compressor stopped. Why? The backup relay failed. Why? It was beyond its service life. Why wasn't it replaced? Preventive maintenance was six months overdue. Why? The PM schedule wasn't being enforced.

Root cause identified: Equipment failure due to inadequate preventive maintenance enforcement.

The system moves the deviation through its lifecycle: Reported, Under Assessment, Under Investigation, Pending Disposition. At each step, the exact user, timestamp, and decision are captured in the ALCOA-plus audit trail.

---

## SCENE 2: COMPLAINT (2:30 - 3:30)

Meanwhile, a customer calls. Acme Pharma reports that packaging on a recent shipment was damaged. Sarah logs the complaint — type: Packaging, severity: Minor, source: Customer.

The system generates complaint number CMP-2026-0001. She notes it's not a medical device report and doesn't require regulatory reporting.

After investigation, the root cause is identified as inadequate secondary packaging. She closes the complaint with a corrective action: reinforced corner protectors added to the shipping specification.

From open to closed — the complete complaint lifecycle, with full traceability.

---

## SCENE 3: CHANGE CONTROL (3:30 - 4:30)

Back to the temperature excursion. Mike, the Engineering Lead, knows this can't happen again. He opens Change Control and raises a change request.

Title: Install dual-relay failover on all cold storage HVAC compressors. Change type: Equipment. Risk level: Medium. Validation required: Yes.

The system assigns change number CCR-2026-0002. It goes through impact assessment and multi-step approval — Engineering, Quality, and Production all sign off.

This is how HawkEye ensures that changes to your manufacturing environment are documented, assessed, and approved before implementation.

---

## SCENE 4: DOCUMENT CONTROL (4:30 - 5:30)

The CAPA from the deviation requires updating the preventive maintenance SOP. Sarah opens Document Control and creates a new version of SOP-WH-007.

She fills in the title, selects document type: SOP, and adds the scope. The system assigns DOC-2026-0026 and sets the status to Draft.

Now here's where the approval workflow comes in. She clicks "Submit for Review" and selects the reviewer role: QA Manager.

The document moves to "Under Review." You can see the approval progress bar — zero percent, one step pending.

The reviewer opens the document, adds their comments, and clicks Approve. The progress bar jumps to 100 percent. Status: Approved.

One more click — Publish — and the SOP becomes Effective. The old version is automatically superseded.

And here's the magic: because this SOP has "requires training on update" enabled, training records are automatically assigned to every affected user. No manual work needed.

---

## SCENE 5: TRAINING (5:30 - 6:00)

Raj, our warehouse operator, opens his Training page and sees the auto-assigned training: "Read and Understand: SOP-WH-007 version 2.0."

He completes the training, and his manager verifies his competency level as "Competent" with a sign-off assessment. Score: 100 out of 80 passing.

Status changes to Completed. The training compliance rate in the dashboard updates automatically.

---

## SCENE 6: EQUIPMENT (6:00 - 6:45)

Mike registers the repaired HVAC unit in the Equipment Master. He enters the name, type: Utility, location, manufacturer details, and sets calibration frequency to 180 days.

The system assigns equipment number EQ-2026-0001. He records the first calibration — result: Pass. Certificate reference noted. Next calibration due date is automatically calculated.

If a calibration fails, the equipment is automatically quarantined. The calibration status badge turns red, and the equipment alerts endpoint flags it for immediate attention.

---

## SCENE 7: RISK MANAGEMENT (6:45 - 7:15)

Sarah adds a risk item to the Risk Register. Using FMEA methodology, she enters the failure mode — HVAC compressor failure — with severity 8, occurrence 4, and detectability 6.

The system calculates the Risk Priority Number: 192. That's in the High Risk band.

She adds a mitigation action: Install dual-relay failover. Owner: Engineering. After implementation, the residual RPN will be recalculated. The goal is to bring it down to the Low Risk band.

---

## SCENE 8: MANAGEMENT REVIEW (7:15 - 8:15)

End of quarter. The VP of Quality opens Management Review and schedules the Q1 review.

Here's what makes HawkEye special: the system automatically aggregates KPIs from every module.

Audit closure rate: 80 percent. CAPA on-time rate: 85 percent. Training compliance: 92 percent. Open deviations: 3, including 1 critical. Equipment calibration overdue: 2.

All of this data is pulled in real time — no spreadsheets, no manual compilation.

The VP assesses QMS adequacy as "Adequate," notes improvement opportunities — automate PM scheduling — and assigns action items. The review is complete.

---

## SCENE 9: SUPPLIER AUDIT (8:15 - 9:00)

Based on the supplier risk score, Sarah initiates the annual re-qualification audit for Lupin Limited.

She selects the supplier, product — Atorvastatin — and the manufacturing site. She sets the audit date and clicks Request.

The system creates audit number HAWK-0000000065 with six draft artifacts: Intimation Letter, Pre-Audit Questionnaire, Scope, Execution Questionnaire, Findings Log, and Final Report.

She sends the Intimation Letter to the supplier. The audit is now visible to Lupin.

The supplier accepts. Sarah assigns an auditor. The 8-phase workflow begins — Initiated, Preparation, Planning, Execution, Findings, CAPA, Closure, Surveillance.

Three actors. Eight phases. One platform.

---

## SCENE 10: E-SIGNATURES (9:00 - 9:30)

Every approval in HawkEye is a 21 CFR Part 11 compliant electronic signature.

When Sarah approved that SOP, the system captured: her identity, the meaning of the signature — "Approved" — a server-generated timestamp, her IP address, and a SHA-256 hash of the document content at the moment of signing.

If anyone modifies the document after signing, the verification endpoint detects the tamper. The hash won't match.

And the ALCOA-plus audit trail captures every change: who did it, what changed, the before and after state, and the exact timestamp. Immutable. Sequential. Ready for any FDA inspection.

---

## CLOSING (9:30 - 10:00)

What you just saw was one quality event — a temperature excursion — flowing through ten interconnected EQMS modules. From deviation to complaint, from CAPA to change control, from SOP revision to training, from equipment calibration to risk register, from management review to supplier audit.

That's HawkEye. One platform. Complete traceability. AI-powered intelligence. Ready for your next FDA inspection.

Visit hawkeyesmart.com to schedule your demo. Thank you for watching.

---

## PRODUCTION NOTES

**For AI voiceover generation:**
- Use ElevenLabs, PlayHT, or similar TTS service
- Male voice: "Adam" (ElevenLabs) or "Davis" (PlayHT) — deep, professional
- Female voice: "Rachel" (ElevenLabs) or "Ava" (PlayHT) — warm, authoritative
- Speed: 1.0x (normal), slightly slower for technical terms
- Pauses: 1-second pause at *[pause]* markers, 2-second pause between scenes
- Export as: MP3 (320kbps) for editing, WAV for final production

**For video editing:**
- Overlay voiceover on the Playwright demo recording (test-results-demo/.../video.webm)
- Or use the 42 EQMS screenshots as a slideshow with voiceover
- Add scene title cards between sections (matching the demo-recording.spec.ts title cards)
- Add lower-third labels for persona names when they appear
- Export: MP4 1080p for YouTube/LinkedIn, MP4 720p for email
