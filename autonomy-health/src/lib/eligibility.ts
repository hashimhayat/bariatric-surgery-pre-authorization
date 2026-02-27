import { prisma } from "@/lib/db";
import {
    EligibilityStatus,
    EligibilityCriterion,
    EligibilityResult,
} from "@/types/fhir";

// ─── Clinical codes ─────────────────────────────────────────────────────────

const BMI_LOINC = "39156-5";

const COMORBIDITY_CODES: Record<string, string> = {
    "59621000": "Essential hypertension",
    "44054006": "Type 2 diabetes mellitus",
    "73430006": "Sleep apnea",
    "162864005": "Obesity (BMI 30+)",
    "399211009": "History of myocardial infarction",
    "22298006": "Myocardial infarction",
    "698271000": "Coronary heart disease",
    "414545008": "Ischemic heart disease",
};

const WEIGHT_LOSS_KEYWORDS = [
    "weight management",
    "weight loss",
    "diet",
    "nutrition",
    "behavioral therapy",
    "behaviour therapy",
    "cognitive and behavioral",
    "lifestyle modification",
    "bariatric",
    "obesity management",
    "assessment of health and social care needs",
    "education, guidance and counseling",
];

const PSYCH_KEYWORDS = [
    "psychosocial",
    "psychological",
    "psychiatric",
    "mental health",
    "psych eval",
    "behavioral health",
    "depression screening",
    "assessment of anxiety",
    "patient health questionnaire",
    "phq-2",
    "phq-9",
];

// ─── Query helpers ──────────────────────────────────────────────────────────

interface RawRow {
    id: string;
    data: string;
}

interface ObsRow extends RawRow {
    value: number | null;
    unit: string | null;
    date: string | null;
}

async function getLatestBMI(patientRef: string): Promise<ObsRow | null> {
    const rows = await prisma.$queryRawUnsafe<ObsRow[]>(
        `SELECT id, data,
            CAST(json_extract(data, '$.valueQuantity.value') AS REAL) as value,
            json_extract(data, '$.valueQuantity.unit') as unit,
            json_extract(data, '$.effectiveDateTime') as date
     FROM Observation
     WHERE json_extract(data, '$.subject.reference') = ?
       AND json_extract(data, '$.code.coding[0].code') = ?
     ORDER BY json_extract(data, '$.effectiveDateTime') DESC
     LIMIT 1`,
        patientRef,
        BMI_LOINC
    );
    return rows.length > 0 ? rows[0] : null;
}

async function getActiveComorbidities(
    patientRef: string
): Promise<{ id: string; code: string; display: string }[]> {
    const codes = Object.keys(COMORBIDITY_CODES);
    const placeholders = codes.map(() => "?").join(",");

    const rows = await prisma.$queryRawUnsafe<
        { id: string; code: string; display: string }[]
    >(
        `SELECT id,
            json_extract(data, '$.code.coding[0].code') as code,
            json_extract(data, '$.code.coding[0].display') as display
     FROM Condition
     WHERE json_extract(data, '$.subject.reference') = ?
       AND json_extract(data, '$.clinicalStatus.coding[0].code') = 'active'
       AND json_extract(data, '$.code.coding[0].code') IN (${placeholders})`,
        patientRef,
        ...codes
    );
    return rows;
}

async function getTotalConditionCount(patientRef: string): Promise<number> {
    const result = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
        `SELECT COUNT(*) as cnt FROM Condition WHERE json_extract(data, '$.subject.reference') = ?`,
        patientRef
    );
    return Number(result[0]?.cnt ?? 0);
}

interface DocResult { id: string; resourceType: string; display: string }

function deduplicateEvidence(docs: DocResult[]): DocResult[] {
    const seen = new Set<string>();
    const unique: DocResult[] = [];
    for (const d of docs) {
        const key = d.display;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(d);
        }
    }
    return unique;
}

async function findDocumentation(
    patientRef: string,
    keywords: string[]
): Promise<{ id: string; display: string; resourceType: string }[]> {
    const results: { id: string; display: string; resourceType: string }[] = [];

    // Search procedures
    for (const kw of keywords) {
        const rows = await prisma.$queryRawUnsafe<
            { id: string; display: string }[]
        >(
            `SELECT id,
              json_extract(data, '$.code.coding[0].display') as display
       FROM "Procedure"
       WHERE json_extract(data, '$.subject.reference') = ?
         AND LOWER(json_extract(data, '$.code.coding[0].display')) LIKE ?
       LIMIT 5`,
            patientRef,
            `%${kw.toLowerCase()}%`
        );
        for (const row of rows) {
            if (!results.some((r) => r.id === row.id)) {
                results.push({ ...row, resourceType: "Procedure" });
            }
        }
    }

    // Search diagnostic reports
    for (const kw of keywords) {
        const rows = await prisma.$queryRawUnsafe<
            { id: string; display: string }[]
        >(
            `SELECT id,
              json_extract(data, '$.code.coding[0].display') as display
       FROM DiagnosticReport
       WHERE json_extract(data, '$.subject.reference') = ?
         AND LOWER(json_extract(data, '$.code.coding[0].display')) LIKE ?
       LIMIT 5`,
            patientRef,
            `%${kw.toLowerCase()}%`
        );
        for (const row of rows) {
            if (!results.some((r) => r.id === row.id)) {
                results.push({ ...row, resourceType: "DiagnosticReport" });
            }
        }
    }

    return results;
}

// ─── Main eligibility evaluator ─────────────────────────────────────────────

export async function evaluateEligibility(
    patientId: string
): Promise<EligibilityResult> {
    const patientRef = `Patient/${patientId}`;
    const criteria: EligibilityCriterion[] = [];
    const unknownReasons: string[] = [];

    // ── 1. BMI check ────────────────────────────────────────────────────────
    const bmi = await getLatestBMI(patientRef);

    let bmiValue: number | null = null;
    let bmiCriterion: EligibilityCriterion;

    if (!bmi || bmi.value === null) {
        bmiCriterion = {
            name: "BMI Threshold",
            status: "unknown",
            detail: "No BMI observation found in patient record",
            evidence: [],
        };
        unknownReasons.push("No BMI data available");
    } else {
        bmiValue = bmi.value;
        const meetsThreshold = bmiValue >= 35;
        bmiCriterion = {
            name: "BMI Threshold",
            status: meetsThreshold ? "met" : "unmet",
            detail: `Most recent BMI: ${bmiValue.toFixed(1)} kg/m² (recorded ${bmi.date ?? "unknown date"})${bmiValue >= 40
                ? " — meets ≥40 threshold (no comorbidity required)"
                : bmiValue >= 35
                    ? " — meets ≥35 threshold (requires qualifying comorbidity)"
                    : " — below 35 threshold"
                }`,
            evidence: [
                {
                    resourceType: "Observation",
                    resourceId: bmi.id,
                    display: `BMI: ${bmiValue.toFixed(1)} ${bmi.unit ?? "kg/m²"}`,
                },
            ],
        };
    }
    criteria.push(bmiCriterion);

    // ── 2. Comorbidity check ────────────────────────────────────────────────
    const comorbidities = await getActiveComorbidities(patientRef);
    const totalConditions = await getTotalConditionCount(patientRef);

    let comorbidityCriterion: EligibilityCriterion;

    if (bmiValue !== null && bmiValue >= 40) {
        // BMI ≥ 40: comorbidity not required
        comorbidityCriterion = {
            name: "Qualifying Comorbidity",
            status: "met",
            detail: "Not required — BMI ≥ 40 qualifies independently",
            evidence: [],
        };
    } else if (comorbidities.length > 0) {
        comorbidityCriterion = {
            name: "Qualifying Comorbidity",
            status: "met",
            detail: `${comorbidities.length} qualifying comorbidity(ies) found: ${comorbidities.map((c) => c.display).join(", ")}`,
            evidence: comorbidities.map((c) => ({
                resourceType: "Condition",
                resourceId: c.id,
                display: c.display,
            })),
        };
    } else if (bmiValue !== null && bmiValue >= 35 && totalConditions === 0) {
        // BMI 35-39.9 but no condition records at all — data may be missing
        comorbidityCriterion = {
            name: "Qualifying Comorbidity",
            status: "unknown",
            detail: "No condition records found in patient data — cannot determine comorbidity status",
            evidence: [],
        };
        unknownReasons.push("No condition records available (missing comorbidity evidence)");
    } else if (bmiValue !== null && bmiValue >= 35) {
        comorbidityCriterion = {
            name: "Qualifying Comorbidity",
            status: "unmet",
            detail:
                "BMI 35-39.9 requires a qualifying comorbidity (hypertension, T2DM, sleep apnea). None found.",
            evidence: [],
        };
    } else {
        comorbidityCriterion = {
            name: "Qualifying Comorbidity",
            status: bmiValue === null ? "unknown" : "unmet",
            detail:
                bmiValue === null
                    ? "Cannot assess — BMI data unavailable"
                    : "Not applicable — BMI below 35",
            evidence: [],
        };
        if (bmiValue === null) {
            unknownReasons.push("Cannot evaluate comorbidity requirement without BMI data");
        }
    }
    criteria.push(comorbidityCriterion);

    // ── 3. Weight-loss documentation ────────────────────────────────────────
    const weightLossDocs = await findDocumentation(
        patientRef,
        WEIGHT_LOSS_KEYWORDS
    );

    // Deduplicate by display name, keep most recent
    const uniqueWLDocs = deduplicateEvidence(weightLossDocs);

    const weightLossCriterion: EligibilityCriterion = {
        name: "Prior Weight-Loss Attempts",
        status: weightLossDocs.length > 0 ? "met" : "unknown",
        detail:
            weightLossDocs.length > 0
                ? `${weightLossDocs.length} documented weight management record(s) found`
                : "No documentation of prior supervised weight-loss attempts found in procedures or diagnostic reports",
        evidence: uniqueWLDocs.slice(0, 2).map((d) => ({
            resourceType: d.resourceType,
            resourceId: d.id,
            display: d.display,
        })),
    };
    if (weightLossDocs.length === 0) {
        unknownReasons.push("No documented prior weight-loss attempts");
    }
    criteria.push(weightLossCriterion);

    // ── 4. Psychological evaluation ─────────────────────────────────────────
    const psychDocs = await findDocumentation(patientRef, PSYCH_KEYWORDS);

    const uniquePsychDocs = deduplicateEvidence(psychDocs);

    const psychCriterion: EligibilityCriterion = {
        name: "Psychological Evaluation",
        status: psychDocs.length > 0 ? "met" : "unknown",
        detail:
            psychDocs.length > 0
                ? `${psychDocs.length} psychological/behavioral health record(s) found`
                : "No documentation of psychological evaluation found in procedures or diagnostic reports",
        evidence: uniquePsychDocs.slice(0, 2).map((d) => ({
            resourceType: d.resourceType,
            resourceId: d.id,
            display: d.display,
        })),
    };
    if (psychDocs.length === 0) {
        unknownReasons.push("No documented psychological evaluation");
    }
    criteria.push(psychCriterion);

    // ── 5. Determine overall status ─────────────────────────────────────────
    let status: EligibilityStatus;
    let summary: string;

    const bmiMet = bmiCriterion.status === "met";
    const comorbidityMet = comorbidityCriterion.status === "met";
    const weightLossMet = weightLossCriterion.status === "met";
    const psychMet = psychCriterion.status === "met";

    const anyUnknown = criteria.some((c) => c.status === "unknown");
    const clinicalMet = bmiMet && comorbidityMet;

    if (bmiCriterion.status === "unmet" || comorbidityCriterion.status === "unmet") {
        status = "not_eligible";
        summary =
            bmiCriterion.status === "unmet"
                ? `BMI ${bmiValue?.toFixed(1)} is below the 35 threshold for bariatric surgery eligibility`
                : `BMI ${bmiValue?.toFixed(1)} requires a qualifying comorbidity, but none were found`;
    } else if (clinicalMet && weightLossMet && psychMet) {
        status = "eligible";
        summary =
            "Patient meets all bariatric surgery eligibility criteria: BMI threshold, comorbidity (if required), documented weight-loss attempts, and psychological evaluation";
    } else if (clinicalMet && anyUnknown) {
        status = "unknown";
        summary = `BMI and comorbidity criteria are met, but documentation is incomplete: ${unknownReasons.join("; ")}`;
    } else {
        status = "unknown";
        summary = `Eligibility cannot be determined: ${unknownReasons.join("; ")}`;
    }

    return { status, summary, criteria, unknownReasons };
}
