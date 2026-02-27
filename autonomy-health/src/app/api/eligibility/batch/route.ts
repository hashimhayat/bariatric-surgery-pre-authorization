import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { EligibilityStatus } from "@/types/fhir";

// Batch-compute eligibility status for ALL patients using efficient SQL subqueries.
// Returns a map of patientId → status.

const COMORBIDITY_CODES = "'59621000','44054006','73430006','162864005','399211009','22298006','698271000','414545008'";

export async function GET() {
    try {
        const rows = await prisma.$queryRawUnsafe<
            {
                id: string;
                latest_bmi: number | null;
                comorbidity_count: number;
                weight_loss_docs: number;
                psych_docs: number;
            }[]
        >(
            `SELECT
        p.id,
        (SELECT CAST(json_extract(o.data, '$.valueQuantity.value') AS REAL)
         FROM Observation o
         WHERE json_extract(o.data, '$.subject.reference') = 'Patient/' || p.id
           AND json_extract(o.data, '$.code.coding[0].code') = '39156-5'
         ORDER BY json_extract(o.data, '$.effectiveDateTime') DESC
         LIMIT 1) as latest_bmi,
        (SELECT COUNT(*) FROM Condition c
         WHERE json_extract(c.data, '$.subject.reference') = 'Patient/' || p.id
           AND json_extract(c.data, '$.clinicalStatus.coding[0].code') = 'active'
           AND json_extract(c.data, '$.code.coding[0].code') IN (${COMORBIDITY_CODES})) as comorbidity_count,
        (SELECT COUNT(*) FROM "Procedure" pr
         WHERE json_extract(pr.data, '$.subject.reference') = 'Patient/' || p.id
           AND (LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%weight%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%diet%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%nutrition%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%behavioral therapy%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%behaviour therapy%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%cognitive and behavioral%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%bariatric%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%assessment of health and social care needs%'
             OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%education, guidance and counseling%'
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

        const result: Record<string, EligibilityStatus> = {};

        for (const row of rows) {
            const bmi = row.latest_bmi;
            const hasComorb = row.comorbidity_count > 0;
            const hasWeightDocs = row.weight_loss_docs > 0;
            const hasPsychDocs = row.psych_docs > 0;

            let status: EligibilityStatus;

            if (bmi === null) {
                status = "unknown";
            } else if (bmi < 35) {
                status = "not_eligible";
            } else if (bmi >= 40) {
                // BMI ≥ 40: no comorbidity needed, just docs
                status = hasWeightDocs && hasPsychDocs ? "eligible" : "unknown";
            } else {
                // BMI 35-39.9: needs comorbidity + docs
                if (!hasComorb) {
                    status = "not_eligible";
                } else {
                    status = hasWeightDocs && hasPsychDocs ? "eligible" : "unknown";
                }
            }

            result[row.id] = status;
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error("Error computing batch eligibility:", error);
        return NextResponse.json(
            { error: "Failed to compute eligibility" },
            { status: 500 }
        );
    }
}
