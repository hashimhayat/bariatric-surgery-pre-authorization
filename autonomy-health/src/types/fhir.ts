// ─── Raw FHIR JSON shapes (subset of fields we actually use) ────────────────

export interface FhirCoding {
    system?: string;
    code?: string;
    display?: string;
}

export interface FhirCodeableConcept {
    coding?: FhirCoding[];
    text?: string;
}

export interface FhirReference {
    reference?: string;
    display?: string;
}

export interface FhirHumanName {
    family?: string;
    given?: string[];
    prefix?: string[];
}

export interface FhirAddress {
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
}

export interface FhirExtension {
    url?: string;
    valueString?: string;
    valueCode?: string;
    valueDecimal?: number;
    valueAddress?: FhirAddress;
    extension?: FhirExtension[];
}

export interface FhirQuantity {
    value?: number;
    unit?: string;
    system?: string;
    code?: string;
}

export interface FhirPeriod {
    start?: string;
    end?: string;
}

// ─── Resource types ─────────────────────────────────────────────────────────

export interface FhirPatient {
    resourceType: "Patient";
    id: string;
    name?: FhirHumanName[];
    gender?: string;
    birthDate?: string;
    address?: FhirAddress[];
    extension?: FhirExtension[];
    deceasedDateTime?: string;
}

export interface FhirCondition {
    resourceType: "Condition";
    id: string;
    clinicalStatus?: FhirCodeableConcept;
    verificationStatus?: FhirCodeableConcept;
    code?: FhirCodeableConcept;
    subject?: FhirReference;
    encounter?: FhirReference;
    onsetDateTime?: string;
    abatementDateTime?: string;
}

export interface FhirObservation {
    resourceType: "Observation";
    id: string;
    status?: string;
    category?: FhirCodeableConcept[];
    code?: FhirCodeableConcept;
    subject?: FhirReference;
    effectiveDateTime?: string;
    valueQuantity?: FhirQuantity;
    valueCodeableConcept?: FhirCodeableConcept;
    valueString?: string;
}

export interface FhirProcedure {
    resourceType: "Procedure";
    id: string;
    status?: string;
    code?: FhirCodeableConcept;
    subject?: FhirReference;
    performedPeriod?: FhirPeriod;
    performedDateTime?: string;
    encounter?: FhirReference;
}

// ─── API response types ─────────────────────────────────────────────────────

export interface PatientListItem {
    id: string;
    name: string;
    gender: string;
    birthDate: string | null;
    age: number | null;
}

export interface PatientDetail {
    id: string;
    name: string;
    gender: string;
    birthDate: string | null;
    age: number | null;
    address: string | null;
    race: string | null;
    ethnicity: string | null;
    deceased: boolean;
}

export interface ConditionSummary {
    id: string;
    name: string;
    clinicalStatus: string | null;
    onsetDate: string | null;
    snomedCode: string | null;
}

export interface ObservationSummary {
    id: string;
    name: string;
    value: string | null;
    unit: string | null;
    date: string | null;
    loincCode: string | null;
}

export interface ProcedureSummary {
    id: string;
    name: string;
    date: string | null;
    status: string | null;
}

export interface MedicationSummary {
    id: string;
    name: string;
    status: string | null;
    authoredOn: string | null;
    reason: string | null;
    rxNormCode: string | null;
}

export interface AllergySummary {
    id: string;
    allergen: string;
    category: string | null;
    criticality: string | null;
    clinicalStatus: string | null;
    reaction: string | null;
    severity: string | null;
    recordedDate: string | null;
}

export interface EncounterSummary {
    id: string;
    type: string;
    encounterClass: string | null;
    startDate: string | null;
    endDate: string | null;
    provider: string | null;
    location: string | null;
    serviceProvider: string | null;
    reasonDisplay: string | null;
}

export interface DiagnosticReportSummary {
    id: string;
    name: string;
    status: string | null;
    category: string | null;
    date: string | null;
    loincCode: string | null;
    performer: string | null;
    noteContent: string | null;
    results: { display: string; reference: string }[];
}

export interface ImmunizationSummary {
    id: string;
    vaccine: string;
    status: string | null;
    date: string | null;
    location: string | null;
}

export interface DocumentReferenceSummary {
    id: string;
    type: string;
    category: string | null;
    date: string | null;
    author: string | null;
    status: string | null;
    contentPreview: string | null;
    encounterRef: string | null;
}

export interface DeviceSummary {
    id: string;
    name: string;
    status: string | null;
    manufacturer: string | null;
    expirationDate: string | null;
    snomedCode: string | null;
    eligibilityTag: string | null;
}

export interface ClinicalSnapshot {
    patient: PatientDetail;
    activeConditions: ConditionSummary[];
    recentProcedures: ProcedureSummary[];
    keyObservations: {
        bmi: ObservationSummary | null;
        bloodPressureSystolic: ObservationSummary | null;
        bloodPressureDiastolic: ObservationSummary | null;
        heartRate: ObservationSummary | null;
        bodyWeight: ObservationSummary | null;
    };
    medications: MedicationSummary[];
    allergies: AllergySummary[];
    encounters: EncounterSummary[];
    diagnosticReports: DiagnosticReportSummary[];
    immunizations: ImmunizationSummary[];
    documentReferences: DocumentReferenceSummary[];
    devices: DeviceSummary[];
}

export interface PatientListResponse {
    patients: PatientListItem[];
    total: number;
    page: number;
    limit: number;
}

// ─── Timeline types ─────────────────────────────────────────────────────────

export interface TimelineEntry {
    id: string;
    resourceType: "Observation" | "Procedure";
    name: string;
    date: string | null;
    category: string | null;
    value: string | null;
    unit: string | null;
    fhirResourceId: string;
    status: string | null;
    code: string | null;
}

export interface TimelineResponse {
    entries: TimelineEntry[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
}

// ─── Eligibility types ──────────────────────────────────────────────────────

export type EligibilityStatus = "eligible" | "not_eligible" | "unknown";

export type CriterionStatus = "met" | "unmet" | "unknown";

export interface EligibilityCriterion {
    name: string;
    status: CriterionStatus;
    detail: string;
    evidence: { resourceType: string; resourceId: string; display: string }[];
}

export interface EligibilityResult {
    status: EligibilityStatus;
    summary: string;
    criteria: EligibilityCriterion[];
    unknownReasons: string[];
}

// ─── AI-Assisted Review types ───────────────────────────────────────────────

export interface AIReviewChecklistItem {
    requirement: string;
    status: "met" | "unmet" | "unknown";
    evidence: string[];   // e.g. ["Observation/obs-123"]
}

export interface AIReviewResult {
    clinicalSummary: string;
    eligibilityAssessment: EligibilityStatus;
    checklist: AIReviewChecklistItem[];
    recommendedNextSteps: string[];
    source: "ai" | "fallback";   // indicates whether AI or deterministic fallback
}
