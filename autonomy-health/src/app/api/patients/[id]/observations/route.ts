import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface ObservationHistoryPoint {
    date: string;
    value: number;
    unit: string;
}

interface ObservationHistoryResponse {
    name: string;
    loincCode: string;
    unit: string;
    points: ObservationHistoryPoint[];
}

// BP panel code — needs component extraction
const BP_PANEL_CODE = "85354-9";
const SYSTOLIC_CODE = "8480-6";
const DIASTOLIC_CODE = "8462-4";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

    if (!code) {
        return NextResponse.json({ error: "Missing 'code' query parameter" }, { status: 400 });
    }

    const patientRef = `Patient/${id}`;

    try {
        // Special handling for systolic/diastolic — they're stored in BP panel
        if (code === SYSTOLIC_CODE || code === DIASTOLIC_CODE) {
            const rows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
                `SELECT id, data FROM Observation
         WHERE json_extract(data, '$.subject.reference') = ?
           AND json_extract(data, '$.code.coding[0].code') = ?
         ORDER BY json_extract(data, '$.effectiveDateTime') DESC
         LIMIT ?`,
                patientRef,
                BP_PANEL_CODE,
                limit
            );

            const isSystolic = code === SYSTOLIC_CODE;
            const points: ObservationHistoryPoint[] = [];
            let name = isSystolic ? "Systolic Blood Pressure" : "Diastolic Blood Pressure";
            let unit = "mm[Hg]";

            for (const row of rows) {
                const d = JSON.parse(row.data);
                const date = d.effectiveDateTime;
                if (!date) continue;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const components: any[] = d.component ?? [];
                for (const comp of components) {
                    const compCode = comp?.code?.coding?.[0]?.code;
                    if (compCode === code) {
                        const val = comp.valueQuantity?.value;
                        if (val !== undefined && val !== null) {
                            unit = comp.valueQuantity?.unit ?? unit;
                            name = comp.code?.coding?.[0]?.display ?? name;
                            points.push({ date, value: Number(val), unit });
                        }
                        break;
                    }
                }
            }

            // Sort chronologically for charting
            points.sort((a, b) => a.date.localeCompare(b.date));

            return NextResponse.json<ObservationHistoryResponse>({
                name,
                loincCode: code,
                unit,
                points,
            });
        }

        // Standard observations (BMI, Heart Rate, Body Weight, etc.)
        const rows = await prisma.$queryRawUnsafe<{ id: string; data: string }[]>(
            `SELECT id, data FROM Observation
       WHERE json_extract(data, '$.subject.reference') = ?
         AND json_extract(data, '$.code.coding[0].code') = ?
       ORDER BY json_extract(data, '$.effectiveDateTime') DESC
       LIMIT ?`,
            patientRef,
            code,
            limit
        );

        const points: ObservationHistoryPoint[] = [];
        let name = "Observation";
        let unit = "";

        for (const row of rows) {
            const d = JSON.parse(row.data);
            const date = d.effectiveDateTime;
            const val = d.valueQuantity?.value;
            if (!date || val === undefined || val === null) continue;

            name = d.code?.coding?.[0]?.display ?? name;
            unit = d.valueQuantity?.unit ?? unit;
            points.push({ date, value: Number(val), unit });
        }

        // Sort chronologically for charting
        points.sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json<ObservationHistoryResponse>({
            name,
            loincCode: code,
            unit,
            points,
        });
    } catch (error) {
        console.error("Error fetching observation history:", error);
        return NextResponse.json({ error: "Failed to fetch observation history" }, { status: 500 });
    }
}
