import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FhirPatient, PatientListResponse } from "@/types/fhir";
import { parsePatientListItem } from "@/lib/fhir-parsers";

// ─── Eligibility SQL subquery fragments ─────────────────────────────────────
// These mirror the batch eligibility logic but as SQL WHERE conditions

const COMORBIDITY_IN = "'59621000','44054006','73430006','162864005','399211009','22298006','698271000','414545008'";

const BMI_SUBQUERY = `(SELECT CAST(json_extract(o.data, '$.valueQuantity.value') AS REAL)
  FROM Observation o
  WHERE json_extract(o.data, '$.subject.reference') = 'Patient/' || p.id
    AND json_extract(o.data, '$.code.coding[0].code') = '39156-5'
  ORDER BY json_extract(o.data, '$.effectiveDateTime') DESC LIMIT 1)`;

const COMORB_SUBQUERY = `(SELECT COUNT(*) FROM Condition c
  WHERE json_extract(c.data, '$.subject.reference') = 'Patient/' || p.id
    AND json_extract(c.data, '$.clinicalStatus.coding[0].code') = 'active'
    AND json_extract(c.data, '$.code.coding[0].code') IN (${COMORBIDITY_IN}))`;

const WEIGHT_DOCS_SUBQUERY = `(SELECT COUNT(*) FROM "Procedure" pr
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
      OR LOWER(json_extract(pr.data, '$.code.coding[0].display')) LIKE '%obesity%'))`;

const PSYCH_DOCS_SUBQUERY = `(SELECT COUNT(*) FROM "Procedure" pr2
  WHERE json_extract(pr2.data, '$.subject.reference') = 'Patient/' || p.id
    AND (LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%depression screening%'
      OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%assessment of anxiety%'
      OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%patient health questionnaire%'
      OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%mental health%'
      OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%psychosocial%'
      OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%psychological%'
      OR LOWER(json_extract(pr2.data, '$.code.coding[0].display')) LIKE '%psychiatric%'))`;

function eligibilityWhereClause(status: string): string {
    const bmi = BMI_SUBQUERY;
    const comorb = COMORB_SUBQUERY;
    const wdocs = WEIGHT_DOCS_SUBQUERY;
    const pdocs = PSYCH_DOCS_SUBQUERY;

    switch (status) {
        case "eligible":
            // (BMI >= 40 OR (BMI >= 35 AND comorbidity)) AND weight docs AND psych docs
            return `AND (
                (${bmi} >= 40 OR (${bmi} >= 35 AND ${comorb} > 0))
                AND ${wdocs} > 0
                AND ${pdocs} > 0
            )`;
        case "not_eligible":
            // BMI < 35 OR (BMI 35-39.9 AND no comorbidity)
            return `AND (
                ${bmi} IS NOT NULL
                AND (${bmi} < 35 OR (${bmi} < 40 AND ${comorb} = 0))
            )`;
        case "unknown":
            // BMI is null OR (meets clinical but missing docs)
            return `AND (
                ${bmi} IS NULL
                OR (
                    (${bmi} >= 40 OR (${bmi} >= 35 AND ${comorb} > 0))
                    AND (${wdocs} = 0 OR ${pdocs} = 0)
                )
            )`;
        default:
            return "";
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const offset = (page - 1) * limit;
    const eligibility = searchParams.get("eligibility") ?? ""; // eligible | not_eligible | unknown

    try {
        // Build WHERE clause
        let searchCondition = "";
        const searchParams2: string[] = [];

        if (search) {
            const searchPattern = `%${search}%`;
            searchCondition = `AND (json_extract(p.data, '$.name[0].given[0]') LIKE ? OR json_extract(p.data, '$.name[0].family') LIKE ? OR p.id LIKE ?)`;
            searchParams2.push(searchPattern, searchPattern, searchPattern);
        }

        const eligibilityCondition = eligibility ? eligibilityWhereClause(eligibility) : "";

        // Count query
        const countResult = await prisma.$queryRawUnsafe<[{ count: number }]>(
            `SELECT COUNT(*) as count FROM Patient p WHERE 1=1 ${searchCondition} ${eligibilityCondition}`,
            ...searchParams2
        );
        const total = Number(countResult[0]?.count ?? 0);

        // Data query
        const rows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT p.id, p.data FROM Patient p WHERE 1=1 ${searchCondition} ${eligibilityCondition}
             ORDER BY json_extract(p.data, '$.name[0].family') ASC,
                      json_extract(p.data, '$.name[0].given[0]') ASC
             LIMIT ? OFFSET ?`,
            ...searchParams2,
            limit,
            offset
        );

        const patients = rows.map((row: { id: string; data: string }) => {
            const fhir: FhirPatient = JSON.parse(row.data);
            return parsePatientListItem(fhir);
        });

        return NextResponse.json<PatientListResponse>({
            patients,
            total,
            page,
            limit,
        });
    } catch (error) {
        console.error("Error fetching patients:", error);
        return NextResponse.json(
            { error: "Failed to fetch patients" },
            { status: 500 }
        );
    }
}
