import {
    FhirPatient,
    FhirCondition,
    FhirObservation,
    FhirProcedure,
    PatientDetail,
    ConditionSummary,
    ObservationSummary,
    ProcedureSummary,
    PatientListItem,
} from "@/types/fhir";

// ─── Patient helpers ────────────────────────────────────────────────────────

export function formatPatientName(patient: FhirPatient): string {
    const name = patient.name?.[0];
    if (!name) return "Unknown";
    const given = name.given?.join(" ") ?? "";
    const family = name.family ?? "";
    const prefix = name.prefix?.join(" ") ?? "";
    return [prefix, given, family].filter(Boolean).join(" ");
}

export function calculateAge(birthDate: string | undefined | null): number | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

function extractExtensionText(patient: FhirPatient, urlFragment: string): string | null {
    const ext = patient.extension?.find((e) => e.url?.includes(urlFragment));
    if (!ext) return null;
    const textExt = ext.extension?.find((e) => e.url === "text");
    return textExt?.valueString ?? null;
}

export function formatAddress(patient: FhirPatient): string | null {
    const addr = patient.address?.[0];
    if (!addr) return null;
    return [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ") || null;
}

// ─── Parse raw JSON to typed summaries ──────────────────────────────────────

export function parsePatientDetail(raw: FhirPatient): PatientDetail {
    return {
        id: raw.id,
        name: formatPatientName(raw),
        gender: raw.gender ?? "Unknown",
        birthDate: raw.birthDate ?? null,
        age: calculateAge(raw.birthDate),
        address: formatAddress(raw),
        race: extractExtensionText(raw, "us-core-race"),
        ethnicity: extractExtensionText(raw, "us-core-ethnicity"),
        deceased: !!raw.deceasedDateTime,
    };
}

export function parsePatientListItem(raw: FhirPatient): PatientListItem {
    return {
        id: raw.id,
        name: formatPatientName(raw),
        gender: raw.gender ?? "Unknown",
        birthDate: raw.birthDate ?? null,
        age: calculateAge(raw.birthDate),
    };
}

export function parseCondition(raw: FhirCondition): ConditionSummary {
    return {
        id: raw.id,
        name: raw.code?.coding?.[0]?.display ?? raw.code?.text ?? "Unknown condition",
        clinicalStatus: raw.clinicalStatus?.coding?.[0]?.code ?? null,
        onsetDate: raw.onsetDateTime ?? null,
        snomedCode: raw.code?.coding?.[0]?.code ?? null,
    };
}

export function parseObservation(raw: FhirObservation): ObservationSummary {
    let value: string | null = null;
    let unit: string | null = null;

    if (raw.valueQuantity) {
        value = raw.valueQuantity.value?.toString() ?? null;
        unit = raw.valueQuantity.unit ?? null;
    } else if (raw.valueCodeableConcept) {
        value = raw.valueCodeableConcept.coding?.[0]?.display ?? raw.valueCodeableConcept.text ?? null;
    } else if (raw.valueString) {
        value = raw.valueString;
    }

    return {
        id: raw.id,
        name: raw.code?.coding?.[0]?.display ?? raw.code?.text ?? "Unknown observation",
        value,
        unit,
        date: raw.effectiveDateTime ?? null,
        loincCode: raw.code?.coding?.[0]?.code ?? null,
    };
}

export function parseProcedure(raw: FhirProcedure): ProcedureSummary {
    const date = raw.performedPeriod?.start ?? raw.performedDateTime ?? null;
    return {
        id: raw.id,
        name: raw.code?.coding?.[0]?.display ?? raw.code?.text ?? "Unknown procedure",
        date,
        status: raw.status ?? null,
    };
}
