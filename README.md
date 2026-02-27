# Autonomy Health Assessment — Prior Auth Review Tool

A clinician-facing prior authorization review tool for bariatric surgery eligibility. Built with **Next.js**, **TypeScript**, **Prisma**, and **SQLite** over FHIR R4 patient data.

---

## Requirements Checklist

### Part A: Data Ingestion
| # | Requirement | Status | How |
|---|------------|--------|-----|
| 1 | Parse and normalize FHIR resources | ✅ | Raw NDJSON → SQLite DB (`fhir_data.db`) with per-resource tables (Patient, Condition, Observation, Procedure, etc.). FHIR JSON stored as `data` column, parsed at query time via `json_extract`. |
| 2 | Correctly resolve references (e.g., Condition.subject → Patient) | ✅ | All queries join via `json_extract(data, '$.subject.reference') = 'Patient/' \|\| id`. Patient references resolved in API routes. |
| 3 | Group all resources by patient | ✅ | Resources queried per-patient using `subject.reference` field. Clinical snapshot, timeline, and eligibility all group by patient ID. |
| 4 | Safely handle missing or partial fields | ✅ | TypeScript types use optional fields. UI shows "—" or "Unknown" for missing data. FHIR parsers use `??` fallbacks throughout. |
| 5 | **Performance optimization** (mandatory) | ✅ | **Technique:** SQLite expression indexes on `json_extract` fields (12 indexes covering subject refs, codes, dates, display text). **Before:** Eligibility filter 5.6s, batch 3.0s. **After:** Eligibility filter 0.26s (22x), batch 0.96s (3x). Optimized the right thing first — correlated subqueries over JSON fields were the dominant bottleneck. |

### Part B: Frontend
| # | Requirement | Status | How |
|---|------------|--------|-----|
| 1 | Patient Selector — select by name or ID | ✅ | Searchable sidebar (`PatientList.tsx`) with debounced search by name or UUID. 50-patient pages with pagination. |
| 2 | Switching patients updates all views | ✅ | Selected patient ID flows from `page.tsx` → all tab components (Snapshot, Timeline, Eligibility). |
| 3 | Clinical Snapshot — age, sex, active conditions, recent procedures, key observations | ✅ | `ClinicalSnapshotView` shows demographics, active conditions (SNOMED-coded), recent procedures, and vitals (BMI, BP, HR, weight). |
| 4 | Timeline — chronological observations + procedures with name, date, FHIR resource ID | ✅ | `Timeline.tsx` merges Observations + Procedures chronologically. Shows type badges, category pills, values, and FHIR IDs. Cursor-based pagination + type filter. |
| 5 | UX: Information hierarchy > visual polish | ✅ | Clean tab-based layout. Data hierarchy: sidebar (select) → tabs (snapshot/timeline/eligibility). Missing data shown explicitly. |

### Part C: Eligibility Logic & Cohort Report
| # | Requirement | Status | How |
|---|------------|--------|-----|
| 1 | BMI ≥ 40 OR BMI ≥ 35 + comorbidity | ✅ | `eligibility.ts` — queries latest BMI (LOINC 39156-5), checks comorbidities (SNOMED: hypertension, T2DM, sleep apnea, etc.). |
| 2 | Required documentation: weight-loss attempts + psych eval | ✅ | Keyword search across Procedure/DiagnosticReport for depression screening, anxiety assessment, PHQ, behavioral therapy, weight management, etc. |
| 3 | Classify each patient as eligible / not eligible / unknown | ✅ | Deterministic 3-way classification. Results: 17 eligible, 1,083 not eligible, 44 unknown. |
| 4 | Explain unknown reasons | ✅ | `unknownReasons[]` in result — e.g., "No BMI data available", "No documented prior weight-loss attempts", "No documented psychological evaluation". |
| 5 | Cohort report: total, counts, percentages, top unknown reasons | ✅ | `GET /api/cohort/report` — returns totals, category counts/percentages, per-criterion breakdown (BMI, comorbidity, docs), a detailed eligible patients table, and ranked unknown reasons. Shown as the default landing view with stat cards, distribution bar, criteria breakdown, and eligible patients table. |

### Part D: AI-Assisted Review
| # | Requirement | Status | How |
|---|------------|--------|-----|
| 1 | Structured JSON output with clinicalSummary, checklist, recommendedNextSteps | ✅ | `POST /api/patients/:id/ai-review` → calls OpenAI o3 with full patient context. Returns structured JSON with clinical summary, eligibility checklist, and next steps. |
| 2 | Grounding — every claim references FHIR resource IDs | ✅ | Post-validation filters evidence to only valid FHIR resource IDs from the patient data. Prompt forbids inventing IDs. |
| 3 | Determinism boundary — AI cannot override Part C logic | ✅ | `eligibilityAssessment` is always overwritten with the deterministic engine result server-side. |
| 4 | Failure handling — graceful fallback to deterministic output | ✅ | On API error, bad JSON, or missing key → returns Part C result formatted as AI review schema, flagged `source: "fallback"`. |
| 5 | No silent inference | ✅ | System prompt forbids "likely/probably/implied". Missing data must be stated as unknown. |

---

## Architecture

```
autonomy-health/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Main page with tab navigation
│   │   └── api/
│   │       ├── patients/route.ts             # GET /api/patients (list, search, eligibility filter)
│   │       ├── patients/[id]/route.ts        # GET /api/patients/:id (clinical snapshot)
│   │       ├── patients/[id]/timeline/       # GET /api/patients/:id/timeline
│   │       ├── patients/[id]/eligibility/    # GET /api/patients/:id/eligibility
│   │       ├── patients/[id]/ai-review/      # POST /api/patients/:id/ai-review
│   │       ├── cohort/report/               # GET /api/cohort/report
│   │       └── eligibility/batch/            # GET /api/eligibility/batch
│   ├── components/
│   │   ├── PatientList.tsx                   # Sidebar with search + eligibility filter
│   │   ├── ClinicalSnapshot.tsx              # Demographics, conditions, vitals
│   │   ├── Timeline.tsx                      # Chronological observations + procedures
│   │   ├── EligibilityPanel.tsx              # Criteria checklist with evidence
│   │   ├── CohortReport.tsx                  # Cohort eligibility dashboard
│   │   └── AIReviewPanel.tsx                 # AI-assisted review panel
│   ├── lib/
│   │   ├── db.ts                             # Prisma client singleton
│   │   ├── eligibility.ts                    # Deterministic eligibility engine
│   │   └── fhir-parsers.ts                   # FHIR resource parsing utilities
│   └── types/
│       └── fhir.ts                           # TypeScript types for FHIR + API responses
├── prisma/schema.prisma                      # Database schema
└── data/fhir_data.db                         # SQLite database with FHIR resources
```

## Running

```bash
cd autonomy-health
npm install
npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)
