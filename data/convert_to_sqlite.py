import os
import sqlite3
import json
import glob
from pathlib import Path

def create_database(db_path, raw_data_dir):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all ndjson files
    ndjson_files = glob.glob(os.path.join(raw_data_dir, '*.ndjson'))
    
    if not ndjson_files:
        print(f"No .ndjson files found in {raw_data_dir}")
        return

    # Process files
    for file_path in sorted(ndjson_files):
        filename = os.path.basename(file_path)
        # File naming format is generally {ResourceType}.{ShardIndex}.ndjson
        resource_type = filename.split('.')[0]
        
        print(f"Processing {filename}...")
        
        # Create table if it doesn't exist. Using JSON column type to make it clear this is JSON, 
        # though SQLite treats it as TEXT under the hood.
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS {resource_type} (
                id TEXT PRIMARY KEY,
                data JSON
            )
        """)
        
        # Read and insert lines
        batch_size = 5000
        batch = []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_number, line in enumerate(f, 1):
                raw_line = line.strip()
                if not raw_line:
                    continue
                try:
                    record = json.loads(raw_line)
                    record_id = record.get('id')
                    
                    if not record_id:
                        print(f"Warning: No 'id' found in {filename} at line {line_number}")
                        continue
                        
                    batch.append((record_id, raw_line))
                        
                    if len(batch) >= batch_size:
                        cursor.executemany(
                            f"INSERT OR REPLACE INTO {resource_type} (id, data) VALUES (?, ?)", 
                            batch
                        )
                        batch = []
                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON in {filename} at line {line_number}: {e}")
                except Exception as e:
                    print(f"Error processing {filename} at line {line_number}: {e}")
            
            # Insert remaining records
            if batch:
                cursor.executemany(
                    f"INSERT OR REPLACE INTO {resource_type} (id, data) VALUES (?, ?)", 
                    batch
                )
        
        # Commit after each file
        conn.commit()
    
    # ─────────────────────────────────────────────────────────────────────────
    # Create expression indexes for fast json_extract queries.
    # 26 custom indexes organized by query pattern.
    # ─────────────────────────────────────────────────────────────────────────
    print("Creating indexes...")
    try:
        # ── 1. Reference indexes (10): link clinical resources → Patient ──
        #    Used by: every per-patient query across all API routes
        tables_with_subject = ['Condition', 'Observation', 'Encounter', 'Procedure', 
                              'MedicationRequest', 'DiagnosticReport', 'DocumentReference']
        for table in tables_with_subject:
            cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            if cursor.fetchone():
                cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_subject ON {table}(json_extract(data, '$.subject.reference'))")
                
        tables_with_patient = ['Immunization', 'AllergyIntolerance', 'Device']
        for table in tables_with_patient:
            cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            if cursor.fetchone():
                cursor.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_patient ON {table}(json_extract(data, '$.patient.reference'))")

        # ── 2. Observation indexes (6): BMI lookups, vitals charting, timeline ──
        #    Used by: GET /patients/:id (vitals), GET /patients/:id/observations,
        #             eligibility engine getLatestBMI(), batch eligibility filter
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_obs_subject ON Observation(json_extract(data, '$.subject.reference'))")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_obs_code ON Observation(json_extract(data, '$.code.coding[0].code'))")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_obs_date ON Observation(json_extract(data, '$.effectiveDateTime'))")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_obs_category ON Observation(json_extract(data, '$.category[0].coding[0].display'))")
        # Compound: WHERE subject=? AND code=?
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_obs_subject_code ON Observation(json_extract(data, '$.subject.reference'), json_extract(data, '$.code.coding[0].code'))")
        # Triple compound: WHERE subject=? AND code=? ORDER BY date DESC
        cursor.execute("""CREATE INDEX IF NOT EXISTS idx_obs_subject_code_date ON Observation (
            json_extract(data, '$.subject.reference'),
            json_extract(data, '$.code.coding[0].code'),
            json_extract(data, '$.effectiveDateTime')
        )""")

        # ── 3. Condition indexes (3): comorbidity check, active condition lists ──
        #    Used by: eligibility engine getActiveComorbidities(), clinical snapshot
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cond_subject ON Condition(json_extract(data, '$.subject.reference'))")
        # Compound: WHERE subject=? AND clinicalStatus='active' AND code IN (...)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_cond_subject_status_code ON Condition(json_extract(data, '$.subject.reference'), json_extract(data, '$.clinicalStatus.coding[0].code'), json_extract(data, '$.code.coding[0].code'))")
        cursor.execute("""CREATE INDEX IF NOT EXISTS idx_cond_subject_status_code2 ON Condition (
            json_extract(data, '$.subject.reference'),
            json_extract(data, '$.clinicalStatus.coding[0].code'),
            json_extract(data, '$.code.coding[0].code')
        )""")

        # ── 4. Procedure indexes (3): weight-loss & psych eval keyword search ──
        #    Used by: eligibility engine findDocumentation(), batch eligibility filter
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_proc_subject ON \"Procedure\"(json_extract(data, '$.subject.reference'))")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_proc_display ON \"Procedure\"(LOWER(json_extract(data, '$.code.coding[0].display')))")
        cursor.execute("""CREATE INDEX IF NOT EXISTS idx_proc_subject_display ON "Procedure" (
            json_extract(data, '$.subject.reference'),
            LOWER(json_extract(data, '$.code.coding[0].display'))
        )""")

        # ── 5. DiagnosticReport indexes (2): keyword search for documentation ──
        #    Used by: eligibility engine findDocumentation() across DiagnosticReport
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_diag_subject ON DiagnosticReport(json_extract(data, '$.subject.reference'))")
        cursor.execute("""CREATE INDEX IF NOT EXISTS idx_diag_subject_display ON DiagnosticReport (
            json_extract(data, '$.subject.reference'),
            LOWER(json_extract(data, '$.code.coding[0].display'))
        )""")

        # ── 6. Patient indexes (2): name search in patient list sidebar ──
        #    Used by: GET /patients?search=... ORDER BY family, given
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_patient_family ON Patient(json_extract(data, '$.name[0].family'))")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_patient_given ON Patient(json_extract(data, '$.name[0].given[0]'))")

        conn.commit()
        print("  Created 26 expression indexes.")

    except Exception as e:
        print(f"Warning: Could not create some indexes: {e}")

    conn.close()
    print(f"Database creation complete. File saved to {db_path}")

if __name__ == "__main__":
    # Resolve paths relative to this script
    base_dir = Path(__file__).parent.resolve()
    db_path = base_dir / 'fhir_data.db'
    raw_data_dir = base_dir / 'raw-data'
    
    print(f"Reading from {raw_data_dir}")
    print(f"Writing to {db_path}")
    
    create_database(str(db_path), str(raw_data_dir))
