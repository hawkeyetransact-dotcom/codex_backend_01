# WHOPIR Template Source Notes

The `WHO PIR Audit Report - Comprehensive Fillable` template was structured using recurring sections observed in these files:

- `test/data/WHOPIR_Alembic21-25July2025.pdf`
- `test/data/WHOPIR_Lupin_31March-4April2025.pdf`
- `test/data/WHOPIR_AurorePharma_DeskAssess_04-06March2025.pdf`
- `test/data/WHOPIR_CiplaUnitI_DeskAssess_9-11February2025.pdf`
- `test/data/WHOPIR_CiplaUnitII_DeskAssess_1-5February2025.pdf`
- `test/data/WHOPIR_SunPharmaceutical_DeskAssess_07-10March2025.pdf`

## Common WHOPIR structure captured

- Part 1: General information (manufacturer, site, contacts, inspection details)
- Part 2A: Onsite summary of findings and comments (GMP system-by-system sections)
- Part 2B: Desk assessment evidence summary (SRA/NRA evidence considered)
- Part 3: Summary of last WHO inspection
- Part 4: Assessment of supporting documentation
- Part 5: Conclusion and inspection outcome
- Part 6: Guidelines referenced

## Implementation mapping

- Template blocks: `seed/reportTemplates.json`
- Autofill-ready report payload keys: `src/services/reportDataService.js`
- New data keys include:
  - `audit.requestId`, `audit.inspectionRecordNumber`, `audit.assessmentMode`, `audit.unitsWorkshops`, `audit.apisCovered`, `audit.validityPeriod`
  - `documentsReviewed[]`, `guidelinesReferenced[]`
  - `sections.*` keys for each WHOPIR part/subsection
  - `regulatoryInspections[]` row schema for desk-assessment evidence table
