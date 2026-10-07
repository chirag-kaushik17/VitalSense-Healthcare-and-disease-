import threading
from collections.abc import Iterable
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clinical_ranges import CONDITION_KEYWORDS, KEY_LAB_CODES, LAB_RANGES, SMOKING_STATUS_MAP, VITAL_RANGES
from app.models import Condition, Encounter, LabResult, Patient, RiskPrediction, Vital
from app.schemas import RiskResult

HIGH_RISK_THRESHOLD = 0.5
MODEL_VERSION = "similarity-v0.1"
_CACHE: dict[str, Any] = {}
_CACHE_LOCK = threading.Lock()


def _python_float(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (np.integer, np.floating)):
        return float(value)
    if hasattr(value, "item"):
        try:
            return float(value.item())
        except (TypeError, ValueError):
            return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _json_safe(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, (np.floating, np.integer)):
        return float(value)
    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]
    return value


def _normalize_smoking(value: str | None) -> tuple[int | None, bool]:
    if value is None:
        return None, True
    normalized = value.strip().lower()
    if normalized in SMOKING_STATUS_MAP:
        return SMOKING_STATUS_MAP[normalized], False
    return None, True


def _compute_age(patient: Patient, latest_encounter: datetime | None) -> int:
    if latest_encounter is None:
        return 65
    delta = latest_encounter.date() - patient.date_of_birth
    return max(0, int(delta.days / 365.25))


def _load_patient_metadata(db: Session) -> tuple[dict[UUID, datetime], dict[UUID, set[str]], dict[UUID, dict[str, float]], list[Patient]]:
    encounter_dates: dict[UUID, datetime] = {}
    for encounter in db.scalars(select(Encounter).order_by(Encounter.started_at.asc())):
        seen = encounter_dates.get(encounter.patient_id)
        if seen is None or encounter.started_at > seen:
            encounter_dates[encounter.patient_id] = encounter.started_at

    condition_flags: dict[UUID, set[str]] = {}
    for condition in db.scalars(select(Condition).where(Condition.status != "resolved")):
        condition_flags.setdefault(condition.patient_id, set()).add(condition.display.lower())

    latest_observations: dict[UUID, dict[str, float]] = {}
    for vital in db.scalars(select(Vital).order_by(Vital.patient_id.asc(), Vital.measured_at.asc())):
        patient_observation = latest_observations.setdefault(vital.patient_id, {})
        for field in VITAL_RANGES:
            value = getattr(vital, field, None)
            if value is not None:
                patient_observation[field] = float(value)

    for lab in db.scalars(select(LabResult).order_by(LabResult.patient_id.asc(), LabResult.measured_at.asc())):
        patient_observation = latest_observations.setdefault(lab.patient_id, {})
        patient_observation[lab.test_code] = float(lab.value)

    patients = list(db.scalars(select(Patient).order_by(Patient.id.asc())))
    return encounter_dates, condition_flags, latest_observations, patients


def _build_feature_cache(db: Session) -> dict[str, Any]:
    encounter_dates, condition_flags, latest_observations, patients = _load_patient_metadata(db)
    smoking_values = [value for patient in patients for value in [SMOKING_STATUS_MAP.get((patient.smoking_status or "").strip().lower())] if value is not None]
    median_smoking = float(np.median(smoking_values)) if smoking_values else 1.0

    rows: list[dict[str, Any]] = []
    for patient in patients:
        patient_id = patient.id
        smoking_value, smoking_missing = _normalize_smoking(patient.smoking_status)
        feature_row: dict[str, Any] = {
            "patient_id": patient_id,
            "age": _compute_age(patient, encounter_dates.get(patient_id)),
            "sex": 1.0 if (patient.sex or "").lower() == "male" else 0.0,
            "smoking_status": float(smoking_value if smoking_value is not None else median_smoking),
            "smoking_missing": 1.0 if smoking_missing else 0.0,
        }

        for field in VITAL_RANGES:
            value = latest_observations.get(patient_id, {}).get(field)
            feature_row[field] = value

        for code in KEY_LAB_CODES:
            label = LAB_RANGES[code]["name"]
            value = latest_observations.get(patient_id, {}).get(code)
            feature_row[label] = value

        patient_condition_text = condition_flags.get(patient_id, set())
        for condition_name, keywords in CONDITION_KEYWORDS.items():
            feature_row[f"cond_{condition_name}"] = float(
                any(any(keyword in text for keyword in keywords) for text in patient_condition_text)
            )

        rows.append(feature_row)

    frame = pd.DataFrame(rows)
    if frame.empty:
        feature_columns = [
            "age",
            "sex",
            "smoking_status",
            "smoking_missing",
            *list(VITAL_RANGES.keys()),
            *[LAB_RANGES[code]["name"] for code in KEY_LAB_CODES],
            *[f"cond_{name}" for name in CONDITION_KEYWORDS],
        ]
        frame = pd.DataFrame(columns=feature_columns)

    numeric_columns = [column for column in frame.columns if column not in {"patient_id"}]
    frame[numeric_columns] = frame[numeric_columns].apply(pd.to_numeric, errors="coerce")
    raw_frame = frame.copy(deep=True)
    median_values = frame[numeric_columns].median().fillna(0.0)
    frame[numeric_columns] = frame[numeric_columns].fillna(median_values).fillna(0.0)

    patient_index = {UUID(str(row["patient_id"])): idx for idx, row in enumerate(frame.to_dict("records"))}
    scaler = StandardScaler()
    scaled_values = scaler.fit_transform(frame[numeric_columns].to_numpy(dtype=float))

    own_risk_values = {}
    out_of_range_map: dict[UUID, list[dict[str, Any]]] = {}
    for idx, patient in enumerate(patients):
        patient_row = raw_frame.iloc[idx].to_dict()
        out_values, risk_value = _calculate_own_risk(patient_row)
        own_risk_values[patient.id] = risk_value
        out_of_range_map[patient.id] = out_values

    similarity_matrix = cosine_similarity(scaled_values)
    np.nan_to_num(similarity_matrix, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
    default_scores: dict[UUID, dict[str, Any]] = {}
    patient_ids = [UUID(str(patient_id)) for patient_id in frame["patient_id"].tolist()]
    for idx, patient_id in enumerate(patient_ids):
        neighbor_indices = [
            int(other_idx)
            for other_idx in np.argsort(-similarity_matrix[idx])
            if int(other_idx) != idx
        ][:5]
        high_risk_count = sum(
            own_risk_values.get(patient_ids[other_idx], 0.0) >= HIGH_RISK_THRESHOLD
            for other_idx in neighbor_indices
        )
        neighbor_fraction = high_risk_count / max(len(neighbor_indices), 1)
        risk_score = min(1.0, 0.6 * own_risk_values.get(patient_id, 0.0) + 0.4 * neighbor_fraction)
        category = "low" if risk_score < 0.33 else "moderate" if risk_score < 0.66 else "high"
        default_scores[patient_id] = {
            "risk_score": float(risk_score),
            "risk_category": category,
            "neighbor_fraction": float(neighbor_fraction),
        }

    return {
        "frame": frame,
        "patient_index": patient_index,
        "scaler": scaler,
        "scaled": scaled_values,
        "similarities": similarity_matrix,
        "own_risk": own_risk_values,
        "out_of_range": out_of_range_map,
        "default_scores": default_scores,
        "patient_ids": patient_ids,
        "patients": patients,
        "encounter_dates": encounter_dates,
        "latest_observations": latest_observations,
    }


def _calculate_own_risk(patient_row: dict[str, Any]) -> tuple[list[dict[str, Any]], float]:
    out_records: list[dict[str, Any]] = []
    total_available = 0
    out_count = 0
    for field, config in VITAL_RANGES.items():
        value = patient_row.get(field)
        if value is None or pd.isna(value):
            continue
        low = config["low"]
        high = config["high"]
        total_available += 1
        if (low is not None and value < low) or (high is not None and value > high):
            out_count += 1
            out_records.append({"measure": field, "value": float(value), "low": low, "high": high})

    for code, meta in LAB_RANGES.items():
        field = meta["name"]
        value = patient_row.get(field)
        if value is None or pd.isna(value):
            continue
        total_available += 1
        low = meta["low"]
        high = meta["high"]
        if (low is not None and value < low) or (high is not None and value > high):
            out_count += 1
            out_records.append({"measure": field, "value": float(value), "low": low, "high": high})

    condition_bump = 0.0
    for key in CONDITION_KEYWORDS:
        if patient_row.get(f"cond_{key}", 0.0) > 0:
            condition_bump += 0.08
    condition_bump = min(0.25, condition_bump)

    if total_available == 0:
        risk = condition_bump
    else:
        risk = min(1.0, (out_count / total_available) + condition_bump)
    return out_records, float(min(1.0, risk))


def _get_cache(db: Session, refresh: bool = False) -> dict[str, Any]:
    cache_key = "global"
    with _CACHE_LOCK:
        if refresh:
            _CACHE.clear()
        if cache_key not in _CACHE:
            _CACHE[cache_key] = _build_feature_cache(db)
        return _CACHE[cache_key]


def get_risk_cache(db: Session, refresh: bool = False) -> dict[str, Any]:
    return _get_cache(db, refresh=refresh)


def score_patient(db: Session, patient_id: UUID, k: int = 5, refresh: bool = False) -> RiskResult:
    cache = _get_cache(db, refresh=refresh)
    frame = cache["frame"]
    patient_index = cache["patient_index"]
    own_risk_values = cache["own_risk"]
    out_of_range_map = cache["out_of_range"]
    if patient_id not in patient_index:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    idx = patient_index[patient_id]
    similarity_matrix = cache["similarities"]
    similarities = []
    for other_idx, other_id in enumerate(frame["patient_id"].tolist()):
        if other_idx == idx:
            continue
        similarity = float(similarity_matrix[idx, other_idx])
        if np.isnan(similarity):
            similarity = 0.0
        similarities.append({
            "patient_id": UUID(str(other_id)),
            "similarity": similarity,
            "own_risk": float(own_risk_values.get(UUID(str(other_id)), 0.0)),
            "high_risk": float(own_risk_values.get(UUID(str(other_id)), 0.0)) >= HIGH_RISK_THRESHOLD,
        })

    top_neighbors = sorted(similarities, key=lambda item: item["similarity"], reverse=True)[: max(1, min(k, 20))]
    neighbor_high_risk_fraction = float(sum(1 for item in top_neighbors if item["high_risk"]) / max(len(top_neighbors), 1))
    own_risk = float(own_risk_values.get(patient_id, 0.0))
    default_score = cache["default_scores"].get(patient_id) if k == 5 else None
    risk_score = float(default_score["risk_score"] if default_score else min(1.0, 0.6 * own_risk + 0.4 * neighbor_high_risk_fraction))
    category = default_score["risk_category"] if default_score else (
        "low" if risk_score < 0.33 else "moderate" if risk_score < 0.66 else "high"
    )

    result = RiskResult(
        patient_id=patient_id,
        risk_score=risk_score,
        risk_category=category,
        own_risk=own_risk,
        neighbor_high_risk_fraction=neighbor_high_risk_fraction,
        model_version=MODEL_VERSION,
        neighbors=[
            {
                "patient_id": neighborhood["patient_id"],
                "similarity": float(neighborhood["similarity"]),
                "own_risk": float(neighborhood["own_risk"]),
                "high_risk": bool(neighborhood["high_risk"]),
            }
            for neighborhood in top_neighbors
        ],
        out_of_range=[
            {
                "measure": item["measure"],
                "value": float(item["value"]),
                "low": item["low"],
                "high": item["high"],
            }
            for item in out_of_range_map.get(patient_id, [])
        ],
    )

    return result


def compute_patient_risk(db: Session, patient_id: UUID, k: int = 5, refresh: bool = False) -> RiskResult:
    result = score_patient(db, patient_id, k=k, refresh=refresh)
    persistence = RiskPrediction(
        patient_id=patient_id,
        risk_score=Decimal(str(round(result.risk_score, 5))),
        risk_category=result.risk_category,
        model_version=MODEL_VERSION,
        top_similar_patients=[
            {"patient_id": str(neighborhood.patient_id), "similarity": float(neighborhood.similarity)}
            for neighborhood in result.neighbors
        ],
        explanation={
            "own_risk": result.own_risk,
            "neighbor_fraction": result.neighbor_high_risk_fraction,
            "weights": {"own_risk": 0.6, "neighbor_fraction": 0.4},
            "out_of_range": _json_safe([item.model_dump() for item in result.out_of_range]),
        },
    )
    db.add(persistence)
    db.commit()
    db.refresh(persistence)
    return result
