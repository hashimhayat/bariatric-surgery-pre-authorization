import { NextRequest, NextResponse } from "next/server";
import { evaluateEligibility } from "@/lib/eligibility";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const result = await evaluateEligibility(id);
        return NextResponse.json(result);
    } catch (error) {
        console.error("Error evaluating eligibility:", error);
        return NextResponse.json(
            { error: "Failed to evaluate eligibility" },
            { status: 500 }
        );
    }
}
