import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
    FhirPatient,
    FhirCondition,
    FhirObservation,
    FhirProcedure,
    ClinicalSnapshot,
    MedicationSummary,
    AllergySummary,
    EncounterSummary,
    DiagnosticReportSummary,
    ImmunizationSummary,
    DocumentReferenceSummary,
    DeviceSummary,
} from "@/types/fhir";
import {
    parsePatientDetail,
    parseCondition,
    parseObservation,
    parseProcedure,
} from "@/lib/fhir-parsers";

// LOINC codes for key observations
const LOINC = {
    BMI: "39156-5",
    BP_PANEL: "85354-9",      // BP stored as a panel, not individual observations
    SYSTOLIC_COMPONENT: "8480-6",
    DIASTOLIC_COMPONENT: "8462-4",
    HEART_RATE: "8867-4",
    BODY_WEIGHT: "29463-7",
} as const;

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // 1. Fetch patient
        const patientRow = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM Patient WHERE id = ?`,
            id
        );

        if (patientRow.length === 0) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const patientFhir: FhirPatient = JSON.parse(patientRow[0].data);
        const patient = parsePatientDetail(patientFhir);
        const patientRef = `Patient/${id}`;

        // 2. Active conditions
        const conditionRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM Condition
       WHERE json_extract(data, '$.subject.reference') = ?
         AND json_extract(data, '$.clinicalStatus.coding[0].code') = 'active'
       ORDER BY json_extract(data, '$.onsetDateTime') DESC`,
            patientRef
        );

        const activeConditions = conditionRows.map((row: { id: string; data: string }) => {
            const fhir: FhirCondition = JSON.parse(row.data);
            return parseCondition(fhir);
        });

        // 3. Recent procedures (last 20)
        const procedureRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM "Procedure"
       WHERE json_extract(data, '$.subject.reference') = ?
       ORDER BY COALESCE(
         json_extract(data, '$.performedPeriod.start'),
         json_extract(data, '$.performedDateTime')
       ) DESC
       LIMIT 20`,
            patientRef
        );

        const recentProcedures = procedureRows.map((row: { id: string; data: string }) => {
            const fhir: FhirProcedure = JSON.parse(row.data);
            return parseProcedure(fhir);
        });

        // 4. Key observations — get the most recent of each type
        async function getLatestObservation(loincCode: string) {
            const rows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
                `SELECT id, data FROM Observation
         WHERE json_extract(data, '$.subject.reference') = ?
           AND json_extract(data, '$.code.coding[0].code') = ?
         ORDER BY json_extract(data, '$.effectiveDateTime') DESC
         LIMIT 1`,
                patientRef,
                loincCode
            );

            if (rows.length === 0) return null;
            const fhir: FhirObservation = JSON.parse(rows[0].data);
            return parseObservation(fhir);
        }

        // BP is stored as a panel (85354-9) with systolic/diastolic as components
        async function getLatestBP() {
            const rows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
                `SELECT id, data FROM Observation
         WHERE json_extract(data, '$.subject.reference') = ?
           AND json_extract(data, '$.code.coding[0].code') = ?
         ORDER BY json_extract(data, '$.effectiveDateTime') DESC
         LIMIT 1`,
                patientRef,
                LOINC.BP_PANEL
            );

            if (rows.length === 0) return { systolic: null, diastolic: null };
            const d = JSON.parse(rows[0].data);
            const date = d.effectiveDateTime ?? null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const components: any[] = d.component ?? [];

            let systolic = null;
            let diastolic = null;
            for (const comp of components) {
                const code = comp?.code?.coding?.[0]?.code;
                if (code === LOINC.SYSTOLIC_COMPONENT) {
                    systolic = {
                        id: d.id + "-sys",
                        name: "Systolic Blood Pressure",
                        value: comp.valueQuantity?.value?.toString() ?? null,
                        unit: comp.valueQuantity?.unit ?? "mm[Hg]",
                        date,
                        category: "vital-signs",
                        loincCode: LOINC.SYSTOLIC_COMPONENT,
                    };
                } else if (code === LOINC.DIASTOLIC_COMPONENT) {
                    diastolic = {
                        id: d.id + "-dia",
                        name: "Diastolic Blood Pressure",
                        value: comp.valueQuantity?.value?.toString() ?? null,
                        unit: comp.valueQuantity?.unit ?? "mm[Hg]",
                        date,
                        category: "vital-signs",
                        loincCode: LOINC.DIASTOLIC_COMPONENT,
                    };
                }
            }
            return { systolic, diastolic };
        }

        const [bmi, bp, heartRate, bodyWeight] = await Promise.all([
            getLatestObservation(LOINC.BMI),
            getLatestBP(),
            getLatestObservation(LOINC.HEART_RATE),
            getLatestObservation(LOINC.BODY_WEIGHT),
        ]);
        const { systolic, diastolic } = bp;

        // 5. Medications — active first, then stopped, up to 30
        const medRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM MedicationRequest
       WHERE json_extract(data, '$.subject.reference') = ?
       ORDER BY
         CASE json_extract(data, '$.status') WHEN 'active' THEN 0 ELSE 1 END,
         json_extract(data, '$.authoredOn') DESC
       LIMIT 30`,
            patientRef
        );

        const medications: MedicationSummary[] = medRows.map((row) => {
            const d = JSON.parse(row.data);
            return {
                id: d.id,
                name: d.medicationCodeableConcept?.coding?.[0]?.display
                    ?? d.medicationCodeableConcept?.text ?? "Unknown medication",
                status: d.status ?? null,
                authoredOn: d.authoredOn ?? null,
                reason: d.reasonCode?.[0]?.coding?.[0]?.display ?? d.reasonCode?.[0]?.text ?? null,
                rxNormCode: d.medicationCodeableConcept?.coding?.[0]?.code ?? null,
            };
        });

        // 6. Allergies
        const allergyRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM AllergyIntolerance
       WHERE json_extract(data, '$.patient.reference') = ?
       ORDER BY json_extract(data, '$.recordedDate') DESC`,
            patientRef
        );

        const allergies: AllergySummary[] = allergyRows.map((row) => {
            const d = JSON.parse(row.data);
            return {
                id: d.id,
                allergen: d.code?.coding?.[0]?.display ?? d.code?.text ?? "Unknown allergen",
                category: Array.isArray(d.category) ? d.category[0] ?? null : d.category ?? null,
                criticality: d.criticality ?? null,
                clinicalStatus: d.clinicalStatus?.coding?.[0]?.code ?? null,
                reaction: d.reaction?.[0]?.manifestation?.[0]?.coding?.[0]?.display ?? null,
                severity: d.reaction?.[0]?.severity ?? null,
                recordedDate: d.recordedDate ?? null,
            };
        });

        // 7. Encounters — most recent 20
        const encounterRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM Encounter
       WHERE json_extract(data, '$.subject.reference') = ?
       ORDER BY json_extract(data, '$.period.start') DESC
       LIMIT 20`,
            patientRef
        );

        const encounters: EncounterSummary[] = encounterRows.map((row) => {
            const d = JSON.parse(row.data);
            return {
                id: d.id,
                type: d.type?.[0]?.coding?.[0]?.display ?? d.type?.[0]?.text ?? "Unknown encounter",
                encounterClass: d.class?.code ?? null,
                startDate: d.period?.start ?? null,
                endDate: d.period?.end ?? null,
                provider: d.participant?.[0]?.individual?.display ?? null,
                location: d.location?.[0]?.location?.display ?? null,
                serviceProvider: d.serviceProvider?.display ?? null,
                reasonDisplay: d.reasonCode?.[0]?.coding?.[0]?.display ?? null,
            };
        });

        // 8. Diagnostic Reports — most recent 20
        const diagRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM DiagnosticReport
       WHERE json_extract(data, '$.subject.reference') = ?
       ORDER BY json_extract(data, '$.effectiveDateTime') DESC
       LIMIT 20`,
            patientRef
        );

        const diagnosticReports: DiagnosticReportSummary[] = diagRows.map((row) => {
            const d = JSON.parse(row.data);

            // Decode base64 note content (H&P notes, clinical notes)
            let noteContent: string | null = null;
            const b64 = d.presentedForm?.[0]?.data;
            if (b64) {
                try {
                    noteContent = Buffer.from(b64, "base64").toString("utf-8");
                } catch { /* ignore decode errors */ }
            }

            // Result references (e.g., PHQ-2 score observation)
            const results = (d.result ?? []).map((r: { display?: string; reference?: string }) => ({
                display: r.display ?? "Result",
                reference: r.reference ?? "",
            }));

            return {
                id: d.id,
                name: d.code?.coding?.[0]?.display ?? d.code?.text ?? "Unknown report",
                status: d.status ?? null,
                category: d.category?.[0]?.coding?.[0]?.display ?? null,
                date: d.effectiveDateTime ?? null,
                loincCode: d.code?.coding?.[0]?.code ?? null,
                performer: d.performer?.[0]?.display ?? null,
                noteContent,
                results,
            };
        });

        // 9. Immunizations — most recent 15
        const immunRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM Immunization
       WHERE json_extract(data, '$.patient.reference') = ?
       ORDER BY json_extract(data, '$.occurrenceDateTime') DESC
       LIMIT 15`,
            patientRef
        );

        const immunizations: ImmunizationSummary[] = immunRows.map((row) => {
            const d = JSON.parse(row.data);
            return {
                id: d.id,
                vaccine: d.vaccineCode?.coding?.[0]?.display ?? d.vaccineCode?.text ?? "Unknown vaccine",
                status: d.status ?? null,
                date: d.occurrenceDateTime ?? null,
                location: d.location?.display ?? null,
            };
        });

        // 10. DocumentReferences — most recent 20
        const docRefRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM DocumentReference
       WHERE json_extract(data, '$.subject.reference') = ?
       ORDER BY json_extract(data, '$.date') DESC
       LIMIT 20`,
            patientRef
        );

        const documentReferences: DocumentReferenceSummary[] = docRefRows.map((row) => {
            const d = JSON.parse(row.data);

            // Decode base64 content preview
            let contentPreview: string | null = null;
            const b64 = d.content?.[0]?.attachment?.data;
            if (b64) {
                try {
                    const full = Buffer.from(b64, "base64").toString("utf-8");
                    contentPreview = full.length > 500 ? full.substring(0, 500) + "…" : full;
                } catch { /* ignore */ }
            }

            return {
                id: d.id,
                type: d.type?.coding?.[0]?.display ?? "Unknown document",
                category: d.category?.[0]?.coding?.[0]?.display ?? null,
                date: d.date ?? null,
                author: d.author?.[0]?.display ?? null,
                status: d.status ?? null,
                contentPreview,
                encounterRef: d.context?.encounter?.[0]?.reference ?? null,
            };
        });

        // 11. Devices — all active
        const deviceRows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM Device
       WHERE json_extract(data, '$.patient.reference') = ?
       ORDER BY json_extract(data, '$.manufactureDate') DESC`,
            patientRef
        );

        // Eligibility relevance tags for devices
        const deviceEligibilityMap: Record<string, string> = {
            "702172008": "Sleep Apnea Evidence",    // CPAP
            "706180003": "Sleep Apnea Evidence",    // Respiratory humidifier (with CPAP)
            "272265001": "Sleep Apnea Evidence",    // Sleep apnea appliance
            "701100002": "Sleep Apnea Evidence",    // Polysomnography analyzer
            "701077002": "Sleep Apnea Evidence",    // Respiratory apnea monitor
            "337414009": "Diabetes Evidence",       // Blood glucose meter
            "228869008": "Mobility Limitation",     // Manual wheelchair
            "705406009": "Mobility Limitation",     // Walker
            "705417005": "Mobility Limitation",     // Wheelchair accessory
            "360008003": "Mobility Limitation",     // Commode
            "706112002": "Mobility Limitation",     // Patient lifting system
        };

        const devices: DeviceSummary[] = deviceRows.map((row) => {
            const d = JSON.parse(row.data);
            const snomedCode = d.type?.coding?.[0]?.code ?? null;
            return {
                id: d.id,
                name: d.deviceName?.[0]?.name ?? d.type?.coding?.[0]?.display ?? d.type?.text ?? "Unknown device",
                status: d.status ?? null,
                manufacturer: d.manufacturer ?? null,
                expirationDate: d.expirationDate ?? null,
                snomedCode,
                eligibilityTag: snomedCode ? deviceEligibilityMap[snomedCode] ?? null : null,
            };
        });

        const snapshot: ClinicalSnapshot = {
            patient,
            activeConditions,
            recentProcedures,
            keyObservations: {
                bmi,
                bloodPressureSystolic: systolic,
                bloodPressureDiastolic: diastolic,
                heartRate,
                bodyWeight,
            },
            medications,
            allergies,
            encounters,
            diagnosticReports,
            immunizations,
            documentReferences,
            devices,
        };

        return NextResponse.json(snapshot);
    } catch (error) {
        console.error("Error fetching patient detail:", error);
        return NextResponse.json(
            { error: "Failed to fetch patient details" },
            { status: 500 }
        );
    }
}
