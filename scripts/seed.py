"""Seed the VitalSense database with synthetic or Synthea sample data."""

from __future__ import annotations

import argparse
import random
import sys
import zipfile
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

import numpy as np
import pandas as pd
from sqlalchemy import insert, text
from sqlalchemy.orm import Session

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.clinical_ranges import KEY_LAB_CODES, LAB_RANGES, VITAL_RANGES
from app.db.session import SessionLocal
from app.models import Condition, Encounter, LabResult, Patient, RiskPrediction, Vital

SYNTHETIC_URL = "https://synthetichealth.github.io/synthea-sample-data/downloads/synthea_sample_data_csv_apr2020.zip"


def normalize_headers(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(col).strip().lower() for col in df.columns]
    return df


def parse_datetime(value: str | None) -> datetime | None:
    if pd.isna(value) or not str(value).strip():
        return None
    parsed = pd.to_datetime(value, utc=True)
    if isinstance(parsed, pd.Series):
        return parsed.iloc[0].to_pydatetime()
    return parsed.to_pydatetime()


def download_synthea_if_needed(base_dir: Path) -> Path:
    base_dir.mkdir(parents=True, exist_ok=True)
    patient_matches = list(base_dir.rglob("patients.csv"))
    if patient_matches:
        return patient_matches[0].parent

    archive_path = base_dir / "synthea_sample_data_csv_apr2020.zip"
    with urlopen(SYNTHETIC_URL) as response, open(archive_path, "wb") as out:
        out.write(response.read())

    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(base_dir)

    csv_root = next((p for p in base_dir.rglob("csv") if p.is_dir()), None)
    if csv_root is None:
        raise FileNotFoundError(f"Unable to locate extracted Synthea CSV directory under {base_dir}")
    return csv_root


def seed_synthetic(db: Session, count: int, rng: random.Random) -> int:
    batch: list[dict] = []
    for _ in range(count):
        patient_id = uuid4()
        dob = date.today().replace(year=date.today().year - rng.randint(25, 85))
        sex = rng.choice(["female", "male"])
        ethnicity = rng.choice(["white", "black", "hispanic", "asian", "other"])
        batch.append({
            "id": patient_id,
            "date_of_birth": dob,
            "sex": sex,
            "ethnicity": ethnicity,
            "mrn": f"syn-{rng.randint(100000, 999999)}",
            "smoking_status": rng.choice(["never", "former", "current"]),
        })
    db.execute(insert(Patient), batch)
    db.commit()
    return count


def seed_synthea(db: Session, source_dir: Path, limit_patients: int | None = None) -> int:
    files = {
        "patients": source_dir / "patients.csv",
        "encounters": source_dir / "encounters.csv",
        "conditions": source_dir / "conditions.csv",
        "observations": source_dir / "observations.csv",
    }
    for key, path in files.items():
        if not path.exists():
            matches = list(source_dir.rglob(f"{key}.csv"))
            if matches:
                files[key] = matches[0]
            else:
                raise FileNotFoundError(f"Missing {key}.csv under {source_dir}")

    patients_df = normalize_headers(pd.read_csv(files["patients"], dtype=str))
    encounters_df = normalize_headers(pd.read_csv(files["encounters"], dtype=str))
    conditions_df = normalize_headers(pd.read_csv(files["conditions"], dtype=str))
    observations_df = normalize_headers(pd.read_csv(files["observations"], dtype=str))

    patients_df = patients_df[[col for col in ["id", "birthdate", "gender", "race", "ethnicity"] if col in patients_df.columns]].copy()
    if "id" not in patients_df.columns:
        raise ValueError("patients.csv missing 'Id' column")

    patient_lookup: dict[str, UUID] = {}
    patient_rows: list[dict] = []
    for _, row in patients_df.iterrows():
        synthea_id = str(row.get("id", "")).strip()
        if not synthea_id:
            continue
        patient_lookup[synthea_id] = uuid4()
        patient_rows.append({
            "id": patient_lookup[synthea_id],
            "mrn": synthea_id,
            "date_of_birth": pd.to_datetime(row.get("birthdate"), errors="coerce").date() if str(row.get("birthdate", "")).strip() else date(2000, 1, 1),
            "sex": "male" if str(row.get("gender", "")).upper() == "M" else "female" if str(row.get("gender", "")).upper() == "F" else "unknown",
            "ethnicity": "hispanic" if str(row.get("ethnicity", "")).lower() == "hispanic" else str(row.get("race", "unknown") or "unknown"),
        })
    if limit_patients is not None:
        limit_count = max(0, int(limit_patients))
        patient_rows = patient_rows[:limit_count]
        patient_lookup = {key: patient_lookup[key] for key in list(patient_lookup)[:limit_count]}

    db.execute(insert(Patient), patient_rows)
    db.commit()

    encounter_rows: list[dict] = []
    for _, row in encounters_df.iterrows():
        patient_id = patient_lookup.get(str(row.get("patient", "")).strip())
        if patient_id is None:
            continue
        started_at = parse_datetime(row.get("start"))
        ended_at = parse_datetime(row.get("stop"))
        if started_at is None:
            continue
        encounter_rows.append({
            "patient_id": patient_id,
            "encounter_type": str(row.get("encounterclass") or "unknown"),
            "started_at": started_at,
            "ended_at": ended_at,
            "reason": str(row.get("reasondescription") or row.get("reasoncode") or "" or None),
        })
    if encounter_rows:
        db.execute(insert(Encounter), encounter_rows)

    condition_rows: list[dict] = []
    for _, row in conditions_df.iterrows():
        patient_id = patient_lookup.get(str(row.get("patient", "")).strip())
        if patient_id is None:
            continue
        code = str(row.get("code") or "unknown")
        display = str(row.get("description") or code)
        recorded_at = parse_datetime(row.get("start"))
        if recorded_at is None:
            continue
        status = "resolved" if pd.notna(row.get("stop")) and str(row.get("stop", "")).strip() else "active"
        condition_rows.append({
            "patient_id": patient_id,
            "code": code,
            "display": display,
            "recorded_at": recorded_at,
            "status": status,
        })
    if condition_rows:
        db.execute(insert(Condition), condition_rows)

    obs_rows = observations_df.copy()
    smoking_status_by_patient: dict[str, str] = {}
    smoking_obs = obs_rows[obs_rows["code"].astype(str).str.strip().eq("72166-2")].copy() if "code" in obs_rows.columns else pd.DataFrame()
    if not smoking_obs.empty:
        normalized_values = smoking_obs["value"].astype(str).str.strip().str.lower()
        for _, row in smoking_obs.iterrows():
            patient_key = str(row.get("patient", "")).strip()
            if not patient_key:
                continue
            value = str(row.get("value", "")).strip().lower()
            if "never" in value:
                smoking_status_by_patient[patient_key] = "never"
            elif "former" in value:
                smoking_status_by_patient[patient_key] = "former"
            elif "current" in value:
                smoking_status_by_patient[patient_key] = "current"

    vital_rows: list[dict] = []
    vital_codes = {
        "8867-4": "heart_rate",
        "8480-6": "systolic_bp",
        "8462-4": "diastolic_bp",
        "9279-1": "respiratory_rate",
        "8310-5": "temperature_c",
        "59408-5": "oxygen_saturation",
        "2708-6": "oxygen_saturation",
    }
    observation_rows: list[dict] = []

    for _, row in obs_rows.iterrows():
        patient_id = patient_lookup.get(str(row.get("patient", "")).strip())
        if patient_id is None:
            continue
        code = str(row.get("code") or "").strip()
        value_text = str(row.get("value") or "").strip()
        measurement_time = parse_datetime(row.get("date"))
        if measurement_time is None:
            continue
        numeric_value = pd.to_numeric(value_text, errors="coerce")
        if code in vital_codes:
            field = vital_codes[code]
            if pd.notna(numeric_value):
                vital_rows.append({
                    "patient_id": patient_id,
                    "measured_at": measurement_time,
                    field: Decimal(str(float(numeric_value))),
                })
            continue
        if pd.notna(numeric_value):
            unit = str(row.get("units") or "n/a").strip() or "n/a"
            label = str(row.get("display") or row.get("description") or "Observation")
            range_data = LAB_RANGES.get(code)
            observation_rows.append({
                "patient_id": patient_id,
                "test_code": code,
                "test_name": label,
                "value": Decimal(str(float(numeric_value))),
                "unit": unit,
                "measured_at": measurement_time,
                "reference_low": Decimal(str(range_data["low"])) if range_data and range_data.get("low") is not None else None,
                "reference_high": Decimal(str(range_data["high"])) if range_data and range_data.get("high") is not None else None,
            })

    if vital_rows:
        vitals_df = pd.DataFrame(vital_rows)
        for field_name in ["heart_rate", "systolic_bp", "diastolic_bp", "respiratory_rate", "temperature_c", "oxygen_saturation"]:
            if field_name not in vitals_df.columns:
                vitals_df[field_name] = None
        vitals_df["date_key"] = vitals_df["measured_at"].dt.floor("D")
        grouping = []
        for (patient_id, _day), group in vitals_df.groupby(["patient_id", "date_key"], dropna=False):
            item = {"patient_id": patient_id, "measured_at": group["measured_at"].max()}
            for field_name in ["heart_rate", "systolic_bp", "diastolic_bp", "respiratory_rate", "temperature_c", "oxygen_saturation"]:
                values = group[field_name].dropna()
                if not values.empty:
                    item[field_name] = Decimal(str(float(values.iloc[-1])))
            grouping.append(item)
        if grouping:
            db.execute(insert(Vital), grouping)

    if observation_rows:
        db.execute(insert(LabResult), observation_rows)

    for patient_key, status in smoking_status_by_patient.items():
        patient_uuid = patient_lookup.get(patient_key)
        if patient_uuid is not None:
            db.execute(text("UPDATE patients SET smoking_status = :status WHERE id = :id"), {"status": status, "id": patient_uuid})

    db.commit()
    summary = {
        "patients": db.execute(text("SELECT COUNT(*) FROM patients")).scalar_one(),
        "encounters": db.execute(text("SELECT COUNT(*) FROM encounters")).scalar_one(),
        "conditions": db.execute(text("SELECT COUNT(*) FROM conditions")).scalar_one(),
        "vitals": db.execute(text("SELECT COUNT(*) FROM vitals")).scalar_one(),
        "lab_results": db.execute(text("SELECT COUNT(*) FROM lab_results")).scalar_one(),
    }
    print("Seed summary:")
    for table_name, count in summary.items():
        print(f"  {table_name}: {count}")
    return summary["patients"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the VitalSense database")
    parser.add_argument("--source", choices=["synthea", "synthetic"], default="synthea")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--limit-patients", type=int, default=None)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    with SessionLocal() as db:
        db.execute(text("TRUNCATE risk_predictions, vitals, lab_results, conditions, encounters, patients CASCADE"))
        db.commit()

        if args.source == "synthetic":
            loaded = seed_synthetic(db, args.count, random.Random(args.seed))
        else:
            source_path = args.data_dir if args.data_dir else download_synthea_if_needed(PROJECT_ROOT / "data" / "synthea_sample")
            loaded = seed_synthea(db, source_path, limit_patients=args.limit_patients)

    print(f"Loaded {loaded} patients from {args.source}")


if __name__ == "__main__":
    main()
