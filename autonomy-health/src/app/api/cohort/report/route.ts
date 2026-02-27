import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Cohort eligibility report — aggregates eligibility across all patients
// Returns: totals, percentages, per-criterion stats, eligible detail, unknown reasons.

const COMORBIDITY_IN = "'59621000','44054006','73430006','162864005','399211009','22298006','698271000','414545008'";

interface PatientEligRow {
    id: string;
    name_given: string | null;
    name_family: string | null;
    gender: string | null;
    birth_date: string | null;
    latest_bmi: number | null;
    bmi_date: string | null;
    comorbidity_count: number;
    total_conditions: number;
    weight_loss_docs: number;
    psych_docs: number;
}

export interface CohortReport {
    total: number;
    categories: {
        eligible: { count: number; percentage: number };
        not_eligible: { count: number; percentage: number };
        unknown: { count: number; percentage: number };
    };
    criteriaBreakdown: {
        name: string;
        description: string;
        metCount: number;
        metPercentage: number;
    }[];
    eligiblePatients: {
        id: string;
        name: string;
        gender: string;
        age: number | null;
        bmi: number;
        comorbidities: number;
        hasWeightDocs: boolean;
        hasPsychDocs: boolean;
    }[];
    unknownReasons: { reason: string; count: number; percentage: number }[];
    notEligibleReasons: { reason: string; count: number; percentage: number }[];
}

function calculateAge(birthDate: string | null): number | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

export async function GET() {
    try {
        const rows = await prisma.$queryRawUnsafe<PatientEligRow[]>(
            `SELECT p.id,
        json_extract(p.data, '$.name[0].given[0]') as name_given,
        json_extract(p.data, '$.name[0].family') as name_family,
        json_extract(p.data, '$.gender') as gender,
        json_extract(p.data, '$.birthDate') as birth_date,
        (SELECT CAST(json_extract(o.data, '$.valueQuantity.value') AS REAL)
         FROM Observation o
         WHERE json_extract(o.data, '$.subject.reference') = 'Patient/' || p.id
           AND json_extract(o.data, '$.code.coding[0].code') = '39156-5'
         ORDER BY json_extract(o.data, '$.effectiveDateTime') DESC LIMIT 1) as latest_bmi,
        (SELECT json_extract(o.data, '$.effectiveDateTime')
         FROM Observation o
         WHERE json_extract(o.data, '$.subject.reference') = 'Patient/' || p.id
           AND json_extract(o.data, '$.code.coding[0].code') = '39156-5'
         ORDER BY json_extract(o.data, '$.effectiveDateTime') DESC LIMIT 1) as bmi_date,
        (SELECT COUNT(*) FROM Condition c
         WHERE json_extract(c.data, '$.subject.reference') = 'Patient/' || p.id
           AND json_extract(c.data, '$.clinicalStatus.coding[0].code') = 'active'
           AND json_extract(c.data, '$.code.coding[0].code') IN (${COMORBIDITY_IN})) as comorbidity_count,
        (SELECT COUNT(*) FROM Condition c2
         WHERE json_extract(c2.data, '$.subject.reference') = 'Patient/' || p.id) as total_conditions,
        (SELECT COUNT(*) FROM "Procedure" pr
         WHERE json_extract(pr.data, '$.subject.reference') = 'Patient/' || p.id
           AND (LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%weight%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%diet%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%nutrition%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%behavioral therapy%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%bariatric%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%assessment of health and social care needs%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%lifestyle%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%obesity%')
        ) as weight_loss_docs,
        (SELECT COUNT(*) FROM "Procedure" pr2
         WHERE json_extract(pr2.data, '$.subject.reference') = 'Patient/' || p.id
           AND (LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%depression screening%'
             OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%assessment of anxiety%'
             OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%patient health questionnaire%'
             OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%mental health%'
             OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%psychosocial%'
             OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%psychological%'
             OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%psychiatric%')
        ) as psych_docs
      FROM Patient p`
        );

        const total = rows.length;
        const counts = { eligible: 0, not_eligible: 0, unknown: 0 };
        const reasonCounts: Record<string, number> = {};
        const notEligReasonCounts: Record<string, number> = {};

        // Per-criterion counters
        let hasBmi = 0;
        let bmiGte40 = 0;
        let bmi35to40 = 0;
        let hasComorbidity = 0;
        let meetsBmiThreshold = 0;
        let hasWeightDocsCount = 0;
        let hasPsychDocsCount = 0;

        const eligiblePatients: CohortReport["eligiblePatients"] = [];

        for (const row of rows) {
            const bmi = row.latest_bmi;
            const comorbCount = Number(row.comorbidity_count);
            const totalConds = Number(row.total_conditions);
            const hasComorb = comorbCount > 0;
            const wdCount = Number(row.weight_loss_docs);
            const pdCount = Number(row.psych_docs);
            const hasWDocs = wdCount > 0;
            const hasPDocs = pdCount > 0;

            // Track criteria stats
            if (bmi !== null) hasBmi++;
            if (bmi !== null && bmi >= 40) bmiGte40++;
            if (bmi !== null && bmi >= 35 && bmi < 40) bmi35to40++;
            if (hasComorb) hasComorbidity++;
            if ((bmi !== null && bmi >= 40) || (bmi !== null && bmi >= 35 && hasComorb)) meetsBmiThreshold++;
            if (hasWDocs) hasWeightDocsCount++;
            if (hasPDocs) hasPsychDocsCount++;

            // Classify
            let status: "eligible" | "not_eligible" | "unknown";
            const unknownR: string[] = [];
            const notEligR: string[] = [];

            if (bmi === null) {
                status = "unknown";
                unknownR.push("No BMI observation recorded");
            } else if (bmi < 35) {
                status = "not_eligible";
                notEligR.push("BMI below 35 kg/m² threshold");
            } else if (bmi >= 40) {
                if (hasWDocs && hasPDocs) {
                    status = "eligible";
                } else {
                    status = "unknown";
                    if (!hasWDocs) unknownR.push("Missing prior weight-loss documentation");
                    if (!hasPDocs) unknownR.push("Missing psychological evaluation");
                }
            } else {
                // BMI 35-39.9
                if (totalConds === 0) {
                    // No condition records at all — data may be missing
                    status = "unknown";
                    unknownR.push("No condition records available (missing comorbidity evidence)");
                } else if (!hasComorb) {
                    status = "not_eligible";
                    notEligR.push("BMI 35–39.9 without qualifying comorbidity");
                } else if (hasWDocs && hasPDocs) {
                    status = "eligible";
                } else {
                    status = "unknown";
                    if (!hasWDocs) unknownR.push("Missing prior weight-loss documentation");
                    if (!hasPDocs) unknownR.push("Missing psychological evaluation");
                }
            }

            counts[status]++;
            for (const r of unknownR) { reasonCounts[r] = (reasonCounts[r] || 0) + 1; }
            for (const r of notEligR) { notEligReasonCounts[r] = (notEligReasonCounts[r] || 0) + 1; }

            if (status === "eligible" && bmi !== null) {
                const prefix = row.name_given?.match(/^(Mr\.|Mrs\.|Ms\.|Dr\.)/) ? "" : "";
                eligiblePatients.push({
                    id: row.id,
                    name: `${prefix}${row.name_given ?? ""} ${row.name_family ?? ""}`.trim(),
                    gender: row.gender ?? "unknown",
                    age: calculateAge(row.birth_date),
                    bmi: Math.round(bmi * 10) / 10,
                    comorbidities: comorbCount,
                    hasWeightDocs: hasWDocs,
                    hasPsychDocs: hasPDocs,
                });
            }
        }

        const unknownReasons = Object.entries(reasonCounts)
            .map(([reason, count]) => ({
                reason,
                count,
                percentage: counts.unknown > 0 ? Math.round((count / counts.unknown) * 1000) / 10 : 0,
            }))
            .sort((a, b) => b.count - a.count);

        const notEligibleReasons = Object.entries(notEligReasonCounts)
            .map(([reason, count]) => ({
                reason,
                count,
                percentage: counts.not_eligible > 0 ? Math.round((count / counts.not_eligible) * 1000) / 10 : 0,
            }))
            .sort((a, b) => b.count - a.count);

        const pct = (n: number) => Math.round((n / total) * 1000) / 10;

        const criteriaBreakdown = [
            { name: "BMI Recorded", description: "Patients with at least one BMI observation", metCount: hasBmi, metPercentage: pct(hasBmi) },
            { name: "BMI ≥ 40", description: "Qualifies independently without comorbidity", metCount: bmiGte40, metPercentage: pct(bmiGte40) },
            { name: "BMI 35–39.9", description: "Qualifies with a comorbidity present", metCount: bmi35to40, metPercentage: pct(bmi35to40) },
            { name: "Active Comorbidity", description: "Hypertension, T2DM, sleep apnea, obesity, heart disease", metCount: hasComorbidity, metPercentage: pct(hasComorbidity) },
            { name: "Meets Clinical Threshold", description: "BMI ≥ 40 or (BMI 35–39.9 + comorbidity)", metCount: meetsBmiThreshold, metPercentage: pct(meetsBmiThreshold) },
            { name: "Weight-Loss Documentation", description: "Evidence of prior supervised weight-loss attempts", metCount: hasWeightDocsCount, metPercentage: pct(hasWeightDocsCount) },
            { name: "Psychological Evaluation", description: "Depression screening, anxiety assessment, PHQ, etc.", metCount: hasPsychDocsCount, metPercentage: pct(hasPsychDocsCount) },
        ];

        const report: CohortReport = {
            total,
            categories: {
                eligible: { count: counts.eligible, percentage: pct(counts.eligible) },
                not_eligible: { count: counts.not_eligible, percentage: pct(counts.not_eligible) },
                unknown: { count: counts.unknown, percentage: pct(counts.unknown) },
            },
            criteriaBreakdown,
            eligiblePatients: eligiblePatients.sort((a, b) => b.bmi - a.bmi),
            unknownReasons,
            notEligibleReasons,
        };

        return NextResponse.json(report);
    } catch (error) {
        console.error("Error generating cohort report:", error);
        return NextResponse.json(
            { error: "Failed to generate cohort report" },
            { status: 500 }
        );
    }
}
