import { NextResponse } from "next/server";
import { evaluateEligibility } from "@/lib/eligibility";
import { prisma } from "@/lib/db";
import type {
    AIReviewResult,
    AIReviewChecklistItem,
    EligibilityResult,
    ClinicalSnapshot,
} from "@/types/fhir";

// ─── Patient data fetcher (reuses snapshot logic inline) ────────────────────

interface RawRow { id: string; data: string; }

async function getPatientContext(patientId: string) {
    const patientRef = `Patient/${patientId}`;

    // Patient basics
    const patients = await prisma.$queryRawUnsafe<RawRow[]>(
        `SELECT id, data FROM Patient WHERE id = ?`, patientId
    );
    if (patients.length === 0) return null;
    const patient = JSON.parse(patients[0].data);

    // Active conditions
    const conditions = await prisma.$queryRawUnsafe<RawRow[]>(
        `SELECT id, data FROM Condition
         WHERE json_extract(data, '$.subject.reference') = ?
           AND json_extract(data, '$.clinicalStatus.coding[0].code') = 'active'`, patientRef
    );

    // Recent observations (last 20)
    const observations = await prisma.$queryRawUnsafe<RawRow[]>(
        `SELECT id, data FROM Observation
         WHERE json_extract(data, '$.subject.reference') = ?
         ORDER BY json_extract(data, '$.effectiveDateTime') DESC LIMIT 20`, patientRef
    );

    // Recent procedures (last 15)
    const procedures = await prisma.$queryRawUnsafe<RawRow[]>(
        `SELECT id, data FROM "Procedure"
         WHERE json_extract(data, '$.subject.reference') = ?
         ORDER BY json_extract(data, '$.performedPeriod.start') DESC LIMIT 15`, patientRef
    );

    // Build a set of all valid resource IDs for grounding validation
    const validResourceIds = new Set<string>();
    validResourceIds.add(`Patient/${patientId}`);
    for (const r of conditions) validResourceIds.add(`Condition/${r.id}`);
    for (const r of observations) validResourceIds.add(`Observation/${r.id}`);
    for (const r of procedures) validResourceIds.add(`Procedure/${r.id}`);

    return {
        patient,
        conditions: conditions.map(r => ({ id: r.id, ...JSON.parse(r.data) })),
        observations: observations.map(r => ({ id: r.id, ...JSON.parse(r.data) })),
        procedures: procedures.map(r => ({ id: r.id, ...JSON.parse(r.data) })),
        validResourceIds,
    };
}

// ─── Build prompt ───────────────────────────────────────────────────────────

function buildPrompt(
    context: NonNullable<Awaited<ReturnType<typeof getPatientContext>>>,
    eligibility: EligibilityResult,
) {
    const { patient, conditions, observations, procedures } = context;

    const name = patient.name?.[0]?.given?.[0]
        ? `${patient.name[0].given[0]} ${patient.name[0].family ?? ""}`
        : "Unknown";
    const gender = patient.gender ?? "unknown";
    const birthDate = patient.birthDate ?? "unknown";

    const conditionSummary = conditions.map((c: any) =>
        `- Condition/${c.id}: ${c.code?.coding?.[0]?.display ?? "Unknown"} (status: ${c.clinicalStatus?.coding?.[0]?.code ?? "unknown"})`
    ).join("\n");

    const obsSummary = observations.map((o: any) => {
        const code = o.code?.coding?.[0]?.display ?? "Unknown";
        const val = o.valueQuantity?.value != null
            ? `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ""}`
            : o.valueCodeableConcept?.coding?.[0]?.display ?? o.valueString ?? "no value";
        const date = o.effectiveDateTime ?? "unknown date";
        return `- Observation/${o.id}: ${code} = ${val} (${date})`;
    }).join("\n");

    const procSummary = procedures.map((p: any) => {
        const code = p.code?.coding?.[0]?.display ?? "Unknown";
        const date = p.performedPeriod?.start ?? p.performedDateTime ?? "unknown date";
        return `- Procedure/${p.id}: ${code} (${date})`;
    }).join("\n");

    const eligibilityCriteria = eligibility.criteria.map(c =>
        `- ${c.name}: ${c.status} — ${c.detail}${c.evidence.length > 0 ? ` [Evidence: ${c.evidence.map(e => `${e.resourceType}/${e.resourceId}`).join(", ")}]` : ""}`
    ).join("\n");

    return `You are a clinical decision support assistant reviewing a patient's eligibility for bariatric surgery prior authorization.

PATIENT: ${name}, ${gender}, DOB: ${birthDate}

ACTIVE CONDITIONS:
${conditionSummary || "None documented"}

RECENT OBSERVATIONS:
${obsSummary || "None documented"}

RECENT PROCEDURES:
${procSummary || "None documented"}

DETERMINISTIC ELIGIBILITY RESULT: ${eligibility.status}
${eligibility.summary}

CRITERIA EVALUATION:
${eligibilityCriteria}

${eligibility.unknownReasons.length > 0 ? `UNKNOWN REASONS: ${eligibility.unknownReasons.join("; ")}` : ""}

INSTRUCTIONS:
1. Write a concise clinical summary of this patient (1-2 sentences).
2. Create a checklist of eligibility requirements, each with status (met/unmet/unknown) and evidence as FHIR resource IDs (e.g. "Observation/abc-123"). ONLY use resource IDs listed above — never invent IDs.
3. Suggest concrete next steps for the reviewer.

HARD RULES:
- The eligibilityAssessment MUST be "${eligibility.status}" — do not change it.
- Every factual claim must reference a FHIR resource ID from the data above, or be explicitly marked as unknown.
- If data is missing, say it is missing. Never use "likely", "probably", or "implied".
- Do NOT make medical claims that are not directly supported by the provided data.

Respond with valid JSON only, matching this exact schema:
{
  "clinicalSummary": "string",
  "eligibilityAssessment": "${eligibility.status}",
  "checklist": [
    { "requirement": "string", "status": "met|unmet|unknown", "evidence": ["ResourceType/id"] }
  ],
  "recommendedNextSteps": ["string"]
}`;
}

// ─── Fallback (deterministic-only response) ─────────────────────────────────

function buildFallback(eligibility: EligibilityResult): AIReviewResult {
    return {
        clinicalSummary: eligibility.summary,
        eligibilityAssessment: eligibility.status,
        checklist: eligibility.criteria.map(c => ({
            requirement: c.name,
            status: c.status,
            evidence: c.evidence.map(e => `${e.resourceType}/${e.resourceId}`),
        })),
        recommendedNextSteps: eligibility.unknownReasons.length > 0
            ? eligibility.unknownReasons.map(r => `Address: ${r}`)
            : ["No further action required — all criteria assessed"],
        source: "fallback" as const,
    };
}

// ─── Grounding validation ───────────────────────────────────────────────────

function validateGrounding(
    result: any,
    validIds: Set<string>,
): AIReviewChecklistItem[] {
    if (!Array.isArray(result.checklist)) return [];

    return result.checklist.map((item: any) => ({
        requirement: String(item.requirement ?? ""),
        status: ["met", "unmet", "unknown"].includes(item.status) ? item.status : "unknown",
        // Filter evidence to only valid FHIR resource IDs
        evidence: Array.isArray(item.evidence)
            ? item.evidence.filter((e: string) => typeof e === "string" && validIds.has(e))
            : [],
    }));
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: patientId } = await params;

    // 1. Get deterministic eligibility (this is the source of truth)
    let eligibility: EligibilityResult;
    try {
        eligibility = await evaluateEligibility(patientId);
    } catch {
        return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // 2. Get patient context for the LLM prompt
    const context = await getPatientContext(patientId);
    if (!context) {
        return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // 3. Check API key
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? "gpt-4o";
    if (!apiKey || apiKey === "your-key-here") {
        console.warn("No OpenAI API key configured — returning fallback");
        return NextResponse.json(buildFallback(eligibility));
    }

    // 4. Call OpenAI
    try {
        const prompt = buildPrompt(context, eligibility);

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "user", content: prompt },
                ],
                ...(model.startsWith("o") ? {
                    // Reasoning models (o3, o4-mini) don't support temperature or response_format
                    max_completion_tokens: 4000,
                } : {
                    // Standard models (gpt-4o, etc.)
                    response_format: { type: "json_object" },
                    temperature: 0.2,
                    max_tokens: 1500,
                }),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenAI API error:", response.status, errorText);
            return NextResponse.json(buildFallback(eligibility));
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            console.error("Empty response from OpenAI");
            return NextResponse.json(buildFallback(eligibility));
        }

        // 5. Parse and validate — reasoning models may wrap JSON in markdown fences
        let parsed: any;
        try {
            let jsonStr = content.trim();
            // Strip markdown code fences if present
            const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (fenceMatch) jsonStr = fenceMatch[1].trim();
            parsed = JSON.parse(jsonStr);
        } catch {
            console.error("Failed to parse OpenAI response as JSON:", content);
            return NextResponse.json(buildFallback(eligibility));
        }

        // 6. DETERMINISM BOUNDARY: force eligibility to match Part C
        parsed.eligibilityAssessment = eligibility.status;

        // 7. GROUNDING: validate all evidence references
        const validatedChecklist = validateGrounding(parsed, context.validResourceIds);

        const result: AIReviewResult = {
            clinicalSummary: typeof parsed.clinicalSummary === "string"
                ? parsed.clinicalSummary
                : eligibility.summary,
            eligibilityAssessment: eligibility.status,
            checklist: validatedChecklist,
            recommendedNextSteps: Array.isArray(parsed.recommendedNextSteps)
                ? parsed.recommendedNextSteps.filter((s: any) => typeof s === "string")
                : [],
            source: "ai",
        };

        return NextResponse.json(result);
    } catch (error) {
        console.error("AI review error:", error);
        return NextResponse.json(buildFallback(eligibility));
    }
}
