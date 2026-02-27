# FHIR Dataset — Data Structure & Migration Guide

## Overview

This project uses synthetic FHIR R4 patient data. The raw data is stored as NDJSON files and migrated into a local **SQLite** database (`fhir_data.db`) for fast, portable querying.

| Property | Value |
|---|---|
| **Source** | [Synthea](https://github.com/synthetichealth/synthea) synthetic patient generator |
| **FHIR Version** | R4 (US Core profiles) |
| **Patients** | ~1,144 |
| **Total Records** | ~1,380,000 across 16 resource types |

---

## Data Layout

```
data/
├── DATA_STRUCTURE.md          ← This file
├── convert_to_sqlite.py       ← Migration script (NDJSON → SQLite)
├── fhir_data.db               ← SQLite database (generated, ~2.2 GB — gitignored)
└── raw-data/                  ← Source NDJSON files (~1.6 GB)
    ├── Patient.000.ndjson
    ├── Condition.000.ndjson
    ├── Observation.000.ndjson … Observation.013.ndjson
    ├── Encounter.000.ndjson … Encounter.002.ndjson
    ├── Procedure.000.ndjson … Procedure.002.ndjson
    ├── MedicationRequest.000.ndjson … MedicationRequest.002.ndjson
    ├── DiagnosticReport.000.ndjson … DiagnosticReport.006.ndjson
    ├── DocumentReference.000.ndjson … DocumentReference.005.ndjson
    ├── Immunization.000.ndjson
    ├── AllergyIntolerance.000.ndjson
    ├── Device.000.ndjson
    ├── Organization.000.ndjson
    ├── Location.000.ndjson
    ├── Practitioner.000.ndjson
    └── PractitionerRole.000.ndjson
```

---

## Part 1 — Raw Data (NDJSON)

### Format

Each file is **NDJSON** (Newline-Delimited JSON) — one complete JSON object per line. Files follow the naming pattern **`{ResourceType}.{ShardIndex}.ndjson`**. When a resource type exceeds ~50 MB, it is split into multiple shards (e.g., `Observation.000.ndjson` through `Observation.013.ndjson`). Each shard contains a **different subset** of records — they are not duplicates.

### Resource Types & Record Counts

#### Clinical Resources (Patient-Linked)

| Resource | Shards | Total Records | Raw Size | Key Fields |
|---|---|---|---|---|
| **Patient** | 1 | 1,144 | 3.6 MB | `name`, `gender`, `birthDate`, `address`, `race`, `ethnicity` |
| **Condition** | 1 | 45,540 | 44 MB | `code` (SNOMED), `clinicalStatus`, `onsetDateTime` |
| **Observation** | 14 | 693,523 | ~693 MB | `code` (LOINC), `valueQuantity` or `valueCodeableConcept`, `effectiveDateTime` |
| **Encounter** | 3 | 87,244 | ~131 MB | `type`, `class`, `period`, `participant` |
| **Procedure** | 3 | 136,515 | ~106 MB | `code` (SNOMED), `performedPeriod`, `reasonReference` |
| **MedicationRequest** | 3 | 95,059 | ~108 MB | `medicationCodeableConcept` (RxNorm), `status`, `authoredOn`, `reasonCode` |
| **DiagnosticReport** | 7 | 160,349 | ~318 MB | `code` (LOINC), `presentedForm` (base64 clinical note), `performer` |
| **DocumentReference** | 6 | 87,244 | ~252 MB | `type` (LOINC), `content.attachment` (base64 text), `author` |
| **Immunization** | 1 | 17,366 | 13 MB | `vaccineCode`, `occurrenceDateTime`, `location` |
| **AllergyIntolerance** | 1 | 835 | 788 KB | `code` (RxNorm), `category`, `criticality`, `reaction` |
| **Device** | 1 | 2,341 | 1.9 MB | `deviceName`, `type` (SNOMED), `udiCarrier`, `status` |

#### Administrative Resources

| Resource | Records | Size | Description |
|---|---|---|---|
| **Organization** | 835 | 908 KB | Healthcare organizations with names, addresses, phone numbers |
| **Location** | 836 | 612 KB | Facility locations with geo-coordinates |
| **Practitioner** | 835 | 632 KB | Individual providers with NPI identifiers |
| **PractitionerRole** | 835 | 996 KB | Provider specialties and organizational affiliations |

---

## Part 2 — SQLite Database (`fhir_data.db`)

### Why SQLite?

- **Zero infrastructure** — the database is a single file, no server required.
- **Deployable** — the `.db` file ships alongside the application code.
- **SQL power** — full relational queries with JOINs across resource types.
- **JSON support** — SQLite's `json_extract()` function allows querying deep into the FHIR JSON.

### Schema

Every FHIR resource type maps to **one table** with exactly two columns:

```sql
CREATE TABLE {ResourceType} (
    id   TEXT PRIMARY KEY,   -- The FHIR resource UUID
    data JSON                -- The full original JSON record, stored as text
);
```

The 16 tables created are: `Patient`, `Condition`, `Observation`, `Encounter`, `Procedure`, `MedicationRequest`, `DiagnosticReport`, `DocumentReference`, `Immunization`, `AllergyIntolerance`, `Device`, `Organization`, `Location`, `Practitioner`, `PractitionerRole`, and `log`.

### Record Counts in the Database

| Table | Records |
|---|---|
| Patient | 1,144 |
| Observation | 693,523 |
| DiagnosticReport | 160,349 |
| Procedure | 136,515 |
| MedicationRequest | 95,059 |
| Encounter | 87,244 |
| DocumentReference | 87,244 |
| Condition | 45,540 |
| Immunization | 17,366 |
| Device | 2,341 |
| AllergyIntolerance | 835 |
| Organization | 835 |
| PractitionerRole | 835 |
| Practitioner | 835 |
| Location | 836 |

### Indexes

The following indexes are created automatically for fast patient-level lookups:

- **`subject.reference`** index on: `Condition`, `Observation`, `Encounter`, `Procedure`, `MedicationRequest`, `DiagnosticReport`, `DocumentReference`
- **`patient.reference`** index on: `Immunization`, `AllergyIntolerance`, `Device`

---

## Part 3 — Migration Process

### How It Works

The migration script (`convert_to_sqlite.py`) performs the following steps:

1. **Discovers all `.ndjson` files** in the `raw-data/` directory.
2. **Creates one table per resource type** — the table name is derived from the filename (e.g., `Observation.005.ndjson` → table `Observation`). Multiple shards merge into the same table.
3. **Reads each file line-by-line**, parses the JSON, extracts the `id` field, and inserts the record as `(id, raw_json_string)` into the table.
4. **Batch inserts** in groups of 5,000 for performance.
5. **Uses `INSERT OR REPLACE`** so the script is idempotent — running it again will not create duplicates.
6. **Creates indexes** on `subject.reference` and `patient.reference` JSON paths for fast lookups.

### Running the Migration

```bash
# From the project root
python3 data/convert_to_sqlite.py
```

This reads from `data/raw-data/` and writes to `data/fhir_data.db`. The script takes approximately 1–2 minutes on a modern machine.

### Regenerating the Database

The `fhir_data.db` file is **gitignored** because it is ~2.2 GB. To regenerate it from a fresh clone:

```bash
python3 data/convert_to_sqlite.py
```

No external Python dependencies are required — the script uses only the standard library (`sqlite3`, `json`, `glob`, `pathlib`).

---

## How Resources Reference Each Other

Every clinical resource links to a **Patient** via `subject.reference` (or `patient.reference`). Most also link to an **Encounter**:

```
Patient
 ├── Condition          → subject.reference, encounter.reference
 ├── Observation         → subject.reference, encounter.reference
 ├── Encounter           → subject.reference → Practitioner, Organization
 ├── Procedure           → subject.reference, encounter.reference → Condition (reason)
 ├── MedicationRequest   → subject.reference, encounter.reference → Practitioner (requester)
 ├── DiagnosticReport    → subject.reference, encounter.reference → Practitioner (performer)
 ├── DocumentReference   → subject.reference → Practitioner (author), Organization (custodian)
 ├── Immunization        → patient.reference, encounter.reference → Location
 ├── AllergyIntolerance  → patient.reference
 └── Device              → patient.reference
```

Reference format: `"Patient/001ea705-d3ba-5329-0b27-a7fbde2f4007"` — extract the UUID after the `/` to join.

### Joining in SQLite

```sql
-- Get all conditions for a specific patient
SELECT json_extract(c.data, '$.code.coding[0].display') AS condition_name
FROM Condition c
WHERE json_extract(c.data, '$.subject.reference') = 'Patient/001ea705-d3ba-5329-0b27-a7fbde2f4007';

-- Join Patient and Observation tables
SELECT
    json_extract(p.data, '$.name[0].given[0]') AS first_name,
    json_extract(o.data, '$.code.coding[0].display') AS observation,
    json_extract(o.data, '$.valueQuantity.value') AS value
FROM Observation o
JOIN Patient p ON 'Patient/' || p.id = json_extract(o.data, '$.subject.reference')
LIMIT 10;
```

---

## Coding Systems

| System | URI | Used For | Example |
|---|---|---|---|
| **SNOMED CT** | `http://snomed.info/sct` | Conditions, Procedures | `44054006` = Type 2 diabetes |
| **LOINC** | `http://loinc.org` | Observations, DiagnosticReports | `39156-5` = BMI |
| **RxNorm** | `http://www.nlm.nih.gov/research/umls/rxnorm` | Medications, Allergies | `205923` = Epoetin Alfa |
| **NPI** | `http://hl7.org/fhir/sid/us-npi` | Practitioner identifiers | `9999992198` |

---

## Example Records

### Patient
```json
{
  "resourceType": "Patient",
  "id": "001ea705-d3ba-5329-0b27-a7fbde2f4007",
  "name": [{ "family": "Schumm995", "given": ["Aleksandr946"], "prefix": ["Mr."] }],
  "gender": "male",
  "birthDate": "1943-06-18",
  "address": [{ "city": "Overland Park", "state": "KS", "postalCode": "66204" }],
  "extension": [
    { "url": ".../us-core-race", "extension": [{ "url": "text", "valueString": "White" }] },
    { "url": ".../us-core-ethnicity", "extension": [{ "url": "text", "valueString": "Not Hispanic or Latino" }] },
    { "url": ".../us-core-birthsex", "valueCode": "M" }
  ]
}
```

### Condition
```json
{
  "resourceType": "Condition",
  "id": "00015277-ac92-cad3-a07e-f444bf37c311",
  "clinicalStatus": { "coding": [{ "code": "active" }] },
  "verificationStatus": { "coding": [{ "code": "confirmed" }] },
  "code": {
    "coding": [{ "system": "http://snomed.info/sct", "code": "706893006", "display": "Victim of intimate partner abuse (finding)" }]
  },
  "subject": { "reference": "Patient/4e0a67e1-cd94-3771-9854-42c925722897" },
  "encounter": { "reference": "Encounter/0ca25d4b-3310-e408-b9bb-c822270a683e" },
  "onsetDateTime": "2009-11-14T22:03:40-05:00"
}
```

### Observation (Lab / Vital)
```json
{
  "resourceType": "Observation",
  "id": "0000019b-1ad3-f95b-90f7-7162d4dfb4bd",
  "status": "final",
  "category": [{ "coding": [{ "code": "laboratory", "display": "Laboratory" }] }],
  "code": {
    "coding": [{ "system": "http://loinc.org", "code": "2514-8", "display": "Ketones [Presence] in Urine by Test strip" }]
  },
  "subject": { "reference": "Patient/4109755f-085a-5908-abdf-168596406e33" },
  "effectiveDateTime": "1985-02-13T02:50:00-05:00",
  "valueCodeableConcept": {
    "coding": [{ "system": "http://snomed.info/sct", "code": "167291007", "display": "Urine ketone test = +++ (finding)" }]
  }
}
```

### Encounter
```json
{
  "resourceType": "Encounter",
  "id": "00008421-99dd-48a3-7ac5-54955166fb07",
  "status": "finished",
  "class": { "code": "AMB" },
  "type": [{ "coding": [{ "code": "162673000", "display": "General examination of patient (procedure)" }] }],
  "subject": { "reference": "Patient/cfe518df-9f38-2322-1c1f-49a45fcc3281", "display": "Mr. Isreal8 Pfannerstill264" },
  "period": { "start": "2018-05-19T05:59:48-04:00", "end": "2018-05-19T06:44:02-04:00" }
}
```

### MedicationRequest
```json
{
  "resourceType": "MedicationRequest",
  "id": "00019c6c-87cf-728d-ed09-04ae797544c3",
  "status": "stopped",
  "intent": "order",
  "medicationCodeableConcept": {
    "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "205923", "display": "1 ML Epoetin Alfa 4000 UNT/ML Injection [Epogen]" }]
  },
  "subject": { "reference": "Patient/ef04d7bf-2139-3c3b-9a8d-5806f78544cf" },
  "authoredOn": "2022-04-29T13:38:33-04:00",
  "reasonCode": [{ "coding": [{ "code": "271737000", "display": "Anemia (disorder)" }] }]
}
```

---

## Key Facts for Bariatric Surgery Eligibility

The primary use case for this data is evaluating **prior authorization for bariatric surgery**:

- **BMI values** → `Observation` with LOINC code `39156-5`
- **Comorbidities** (type 2 diabetes, hypertension, sleep apnea) → `Condition` resources with SNOMED codes
- **Eligibility rule**: BMI > 40, **or** BMI > 35 with at least one qualifying comorbidity
- **Supporting documentation** → `DiagnosticReport` and `DocumentReference` contain embedded clinical notes (base64-encoded)

### Example Eligibility Query (SQLite)

```sql
SELECT
    json_extract(p.data, '$.name[0].given[0]') || ' ' || json_extract(p.data, '$.name[0].family') AS patient_name,
    json_extract(o.data, '$.valueQuantity.value') AS bmi,
    json_extract(o.data, '$.effectiveDateTime') AS measured_on
FROM Observation o
JOIN Patient p ON 'Patient/' || p.id = json_extract(o.data, '$.subject.reference')
WHERE json_extract(o.data, '$.code.coding[0].code') = '39156-5'
  AND CAST(json_extract(o.data, '$.valueQuantity.value') AS REAL) > 40
ORDER BY bmi DESC
LIMIT 10;
```
