#!/usr/bin/env python3
"""
Data Integrity Tests — verifies raw NDJSON data matches the SQLite database.
Run: python3 tests/test_data_integrity.py
"""

import json
import os
import random
import sqlite3
import sys
import unittest
import urllib.request
import urllib.error
from pathlib import Path

# ─── Paths ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent  # autonomy-health-assessment/
RAW_DATA_DIR = ROOT / "data" / "raw-data"
DB_PATH = ROOT / "data" / "fhir_data.db"
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")


# ─── Helpers ────────────────────────────────────────────────────────────────
def count_ndjson_lines(resource_type: str) -> int:
    """Count total non-empty lines across all NDJSON shards for a resource type."""
    total = 0
    for f in sorted(RAW_DATA_DIR.glob(f"{resource_type}.*.ndjson")):
        with open(f, "r", encoding="utf-8") as fh:
            total += sum(1 for line in fh if line.strip())
    return total


def get_random_ndjson_records(resource_type: str, n: int) -> list[dict]:
    """Get n random records from the NDJSON files for a resource type."""
    all_lines = []
    for f in sorted(RAW_DATA_DIR.glob(f"{resource_type}.*.ndjson")):
        with open(f, "r", encoding="utf-8") as fh:
            all_lines.extend(line.strip() for line in fh if line.strip())
    sample = random.sample(all_lines, min(n, len(all_lines)))
    return [json.loads(line) for line in sample]


def api_get(path: str) -> tuple[int, dict]:
    """Make a GET request to the API and return (status, json)."""
    try:
        req = urllib.request.Request(f"{BASE_URL}{path}")
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, {}


def api_post(path: str) -> tuple[int, dict]:
    """Make a POST request to the API."""
    try:
        req = urllib.request.Request(f"{BASE_URL}{path}", method="POST", data=b"")
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, {}


# ─── Open DB ─────────────────────────────────────────────────────────────────
conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row
cursor = conn.cursor()


def db_count(table: str) -> int:
    return cursor.execute(f'SELECT COUNT(*) as c FROM "{table}"').fetchone()["c"]


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 1: Row counts — NDJSON lines == DB rows
# ═══════════════════════════════════════════════════════════════════════════════

RESOURCE_TYPES = [
    "Patient", "Condition", "Observation", "Procedure", "Encounter",
    "MedicationRequest", "DiagnosticReport", "DocumentReference",
    "Immunization", "AllergyIntolerance", "Device",
    "Organization", "Location", "Practitioner", "PractitionerRole",
]


class TestRowCounts(unittest.TestCase):
    """Verify every NDJSON resource has a matching row count in the DB."""

    def test_row_counts(self):
        for rt in RESOURCE_TYPES:
            with self.subTest(resource=rt):
                ndjson = count_ndjson_lines(rt)
                db = db_count(rt)
                self.assertEqual(db, ndjson,
                    f"{rt}: DB has {db} rows but NDJSON has {ndjson} lines")


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 2: Spot checks — random records exist with matching JSON
# ═══════════════════════════════════════════════════════════════════════════════

class TestSpotChecks(unittest.TestCase):
    """Pick 5 random records per key resource type and verify they exist in DB."""

    def _check_type(self, resource_type: str):
        records = get_random_ndjson_records(resource_type, 5)
        for rec in records:
            row = cursor.execute(
                f'SELECT id, data FROM "{resource_type}" WHERE id = ?',
                (rec["id"],)
            ).fetchone()
            self.assertIsNotNone(row, f"{resource_type}/{rec['id']} missing from DB")
            db_data = json.loads(row["data"])
            self.assertEqual(db_data["resourceType"], rec["resourceType"])
            self.assertEqual(db_data["id"], rec["id"])

    def test_patient_spot_check(self):
        self._check_type("Patient")

    def test_condition_spot_check(self):
        self._check_type("Condition")

    def test_observation_spot_check(self):
        self._check_type("Observation")

    def test_procedure_spot_check(self):
        self._check_type("Procedure")


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 3: Patient field integrity
# ═══════════════════════════════════════════════════════════════════════════════

class TestPatientFieldIntegrity(unittest.TestCase):
    """Verify key patient fields (name, gender, birthDate) match between NDJSON and DB."""

    def test_patient_fields_preserved(self):
        patients = get_random_ndjson_records("Patient", 5)
        for raw in patients:
            row = cursor.execute(
                "SELECT data FROM Patient WHERE id = ?", (raw["id"],)
            ).fetchone()
            self.assertIsNotNone(row)
            db_p = json.loads(row["data"])
            self.assertEqual(db_p["name"], raw["name"],
                f"Name mismatch for Patient/{raw['id']}")
            self.assertEqual(db_p["gender"], raw["gender"],
                f"Gender mismatch for Patient/{raw['id']}")
            self.assertEqual(db_p.get("birthDate"), raw.get("birthDate"),
                f"BirthDate mismatch for Patient/{raw['id']}")


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 4: Reference integrity
# ═══════════════════════════════════════════════════════════════════════════════

class TestReferenceIntegrity(unittest.TestCase):
    """Verify that Conditions and Observations reference existing Patients."""

    def test_condition_references_valid_patients(self):
        conditions = get_random_ndjson_records("Condition", 20)
        for cond in conditions:
            ref = cond.get("subject", {}).get("reference", "")
            self.assertTrue(ref.startswith("Patient/"),
                f"Condition/{cond['id']} has bad ref: {ref}")
            pid = ref.replace("Patient/", "")
            exists = cursor.execute(
                "SELECT 1 FROM Patient WHERE id = ?", (pid,)
            ).fetchone()
            self.assertIsNotNone(exists,
                f"Condition/{cond['id']} → Patient/{pid} not found")

    def test_observation_references_valid_patients(self):
        obs = get_random_ndjson_records("Observation", 20)
        for ob in obs:
            ref = ob.get("subject", {}).get("reference", "")
            self.assertTrue(ref.startswith("Patient/"),
                f"Observation/{ob['id']} has bad ref: {ref}")
            pid = ref.replace("Patient/", "")
            exists = cursor.execute(
                "SELECT 1 FROM Patient WHERE id = ?", (pid,)
            ).fetchone()
            self.assertIsNotNone(exists,
                f"Observation/{ob['id']} → Patient/{pid} not found")


# ═══════════════════════════════════════════════════════════════════════════════
# TEST GROUP 5: API endpoint validation
# ═══════════════════════════════════════════════════════════════════════════════

class TestAPIPatientList(unittest.TestCase):
    """Test GET /api/patients."""

    def test_returns_valid_response(self):
        status, data = api_get("/api/patients?limit=5")
        self.assertEqual(status, 200)
        self.assertIn("patients", data)
        self.assertIsInstance(data["patients"], list)
        self.assertGreater(data["total"], 0)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["limit"], 5)
        for p in data["patients"]:
            self.assertIn("id", p)
            self.assertIn("name", p)

    def test_total_matches_db(self):
        _, data = api_get("/api/patients?limit=1")
        self.assertEqual(data["total"], db_count("Patient"))

    def test_search_filters(self):
        row = cursor.execute(
            "SELECT json_extract(data, '$.name[0].family') as family FROM Patient LIMIT 1"
        ).fetchone()
        family = row["family"]
        _, data = api_get(f"/api/patients?search={family}&limit=50")
        self.assertGreater(data["total"], 0,
            f'Search for "{family}" returned 0')


class TestAPIPatientDetail(unittest.TestCase):
    """Test GET /api/patients/:id."""

    def test_returns_clinical_snapshot(self):
        row = cursor.execute(
            "SELECT id FROM Patient ORDER BY RANDOM() LIMIT 1"
        ).fetchone()
        status, data = api_get(f"/api/patients/{row['id']}")
        self.assertEqual(status, 200)
        self.assertIn("patient", data)
        self.assertIn("activeConditions", data)
        self.assertIn("recentProcedures", data)
        self.assertIn("keyObservations", data)
        for key in ["bmi", "bloodPressureSystolic", "bloodPressureDiastolic",
                     "heartRate", "bodyWeight"]:
            self.assertIn(key, data["keyObservations"])

    def test_404_for_nonexistent(self):
        status, _ = api_get("/api/patients/nonexistent-12345")
        self.assertEqual(status, 404)


class TestAPIEligibility(unittest.TestCase):
    """Test GET /api/patients/:id/eligibility."""

    def test_returns_valid_result(self):
        row = cursor.execute(
            "SELECT id FROM Patient ORDER BY RANDOM() LIMIT 1"
        ).fetchone()
        status, data = api_get(f"/api/patients/{row['id']}/eligibility")
        self.assertEqual(status, 200)
        self.assertIn(data["status"], ["eligible", "not_eligible", "unknown"])
        self.assertIn("summary", data)
        self.assertIsInstance(data["criteria"], list)
        for c in data["criteria"]:
            self.assertIn(c["status"], ["met", "unmet", "unknown"])


class TestAPICohortReport(unittest.TestCase):
    """Test GET /api/cohort/report."""

    def test_returns_valid_cohort(self):
        status, data = api_get("/api/cohort/report")
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], db_count("Patient"))

        cats = data["categories"]
        cat_sum = cats["eligible"]["count"] + cats["not_eligible"]["count"] + cats["unknown"]["count"]
        self.assertEqual(cat_sum, data["total"],
            f"Category sum {cat_sum} != total {data['total']}")

        pct_sum = cats["eligible"]["percentage"] + cats["not_eligible"]["percentage"] + cats["unknown"]["percentage"]
        self.assertAlmostEqual(pct_sum, 100, delta=1,
            msg=f"Percentages sum to {pct_sum:.1f}, expected ~100")


# ─── Run ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"DB: {DB_PATH}")
    print(f"Raw data: {RAW_DATA_DIR}")
    print(f"API: {BASE_URL}")
    print()
    unittest.main(verbosity=2)
