import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
    FhirObservation,
    FhirProcedure,
    TimelineEntry,
    TimelineResponse,
} from "@/types/fhir";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const cursor = searchParams.get("cursor"); // ISO date string for cursor-based pagination
    const typeFilter = searchParams.get("type") ?? "all"; // all | observation | procedure

    const patientRef = `Patient/${id}`;

    try {
        const entries: TimelineEntry[] = [];

        // Build cursor condition
        const cursorCondition = cursor ? `AND date < ?` : "";
        const cursorParams = cursor ? [cursor] : [];

        // ── Fetch observations ──────────────────────────────────────────────
        if (typeFilter === "all" || typeFilter === "observation") {
            const obsRows = await prisma.$queryRawUnsafe<{ id: string; data: string; date: string }[]>(
                `SELECT id, data,
                json_extract(data, '$.effectiveDateTime') as date
         FROM Observation
         WHERE json_extract(data, '$.subject.reference') = ?
           ${cursor ? "AND json_extract(data, '$.effectiveDateTime') < ?" : ""}
         ORDER BY json_extract(data, '$.effectiveDateTime') DESC
         LIMIT ?`,
                patientRef,
                ...cursorParams,
                limit + 1 // fetch one extra to detect hasMore
            );

            for (const row of obsRows) {
                const fhir: FhirObservation = JSON.parse(row.data);

                let value: string | null = null;
                let unit: string | null = null;
                if (fhir.valueQuantity) {
                    value = fhir.valueQuantity.value?.toString() ?? null;
                    unit = fhir.valueQuantity.unit ?? null;
                } else if (fhir.valueCodeableConcept) {
                    value = fhir.valueCodeableConcept.coding?.[0]?.display ?? fhir.valueCodeableConcept.text ?? null;
                } else if (fhir.valueString) {
                    value = fhir.valueString;
                }

                entries.push({
                    id: fhir.id,
                    resourceType: "Observation",
                    name: fhir.code?.coding?.[0]?.display ?? fhir.code?.text ?? "Unknown observation",
                    date: fhir.effectiveDateTime ?? null,
                    category: fhir.category?.[0]?.coding?.[0]?.display ?? null,
                    value,
                    unit,
                    fhirResourceId: `Observation/${fhir.id}`,
                    status: fhir.status ?? null,
                    code: fhir.code?.coding?.[0]?.code ?? null,
                });
            }
        }

        // ── Fetch procedures ────────────────────────────────────────────────
        if (typeFilter === "all" || typeFilter === "procedure") {
            const procRows = await prisma.$queryRawUnsafe<{ id: string; data: string; date: string }[]>(
                `SELECT id, data,
                COALESCE(json_extract(data, '$.performedPeriod.start'), json_extract(data, '$.performedDateTime')) as date
         FROM "Procedure"
         WHERE json_extract(data, '$.subject.reference') = ?
           ${cursor ? "AND COALESCE(json_extract(data, '$.performedPeriod.start'), json_extract(data, '$.performedDateTime')) < ?" : ""}
         ORDER BY COALESCE(json_extract(data, '$.performedPeriod.start'), json_extract(data, '$.performedDateTime')) DESC
         LIMIT ?`,
                patientRef,
                ...cursorParams,
                limit + 1
            );

            for (const row of procRows) {
                const fhir: FhirProcedure = JSON.parse(row.data);
                const date = fhir.performedPeriod?.start ?? fhir.performedDateTime ?? null;

                entries.push({
                    id: fhir.id,
                    resourceType: "Procedure",
                    name: fhir.code?.coding?.[0]?.display ?? fhir.code?.text ?? "Unknown procedure",
                    date,
                    category: null,
                    value: null,
                    unit: null,
                    fhirResourceId: `Procedure/${fhir.id}`,
                    status: fhir.status ?? null,
                    code: fhir.code?.coding?.[0]?.code ?? null,
                });
            }
        }

        // ── Sort merged entries by date (descending) ────────────────────────
        entries.sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return b.date.localeCompare(a.date);
        });

        // ── Apply limit + determine cursor ──────────────────────────────────
        const hasMore = entries.length > limit;
        const sliced = entries.slice(0, limit);
        const nextCursor = hasMore && sliced.length > 0
            ? sliced[sliced.length - 1].date
            : null;

        // ── Get total count ─────────────────────────────────────────────────
        let total = 0;
        if (typeFilter === "all" || typeFilter === "observation") {
            const obsCount = await prisma.$queryRawUnsafe<[{ count: number }]>(
                `SELECT COUNT(*) as count FROM Observation WHERE json_extract(data, '$.subject.reference') = ?`,
                patientRef
            );
            total += Number(obsCount[0]?.count ?? 0);
        }
        if (typeFilter === "all" || typeFilter === "procedure") {
            const procCount = await prisma.$queryRawUnsafe<[{ count: number }]>(
                `SELECT COUNT(*) as count FROM "Procedure" WHERE json_extract(data, '$.subject.reference') = ?`,
                patientRef
            );
            total += Number(procCount[0]?.count ?? 0);
        }

        return NextResponse.json<TimelineResponse>({
            entries: sliced,
            nextCursor,
            hasMore,
            total,
        });
    } catch (error) {
        console.error("Error fetching timeline:", error);
        return NextResponse.json(
            { error: "Failed to fetch timeline" },
            { status: 500 }
        );
    }
}
