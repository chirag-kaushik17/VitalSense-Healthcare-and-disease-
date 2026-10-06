from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import TypeVar
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Condition, Encounter, LabResult, Patient, RiskPrediction, Vital
from app.schemas import (
    ConditionCreate, ConditionRead, EncounterCreate, EncounterRead,
    LabResultCreate, LabResultRead, PatientCreate, PatientRead,
    RiskPredictionRead, RiskResult, VitalCreate, VitalRead,
)
from app.similarity import compute_patient_risk

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="VitalSense API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ModelT = TypeVar("ModelT")
CreateT = TypeVar("CreateT")


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/ui", status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ui", include_in_schema=False)
def ui_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


def _patient_age(patient: Patient, latest_encounter: datetime | None) -> int:
    if latest_encounter is None:
        return 65
    delta = latest_encounter.date() - patient.date_of_birth
    return max(0, int(delta.days / 365.25))


def _latest_patient_vitals(db: Session, patient_id: UUID) -> dict[str, float]:
    latest_vital = db.execute(
        select(Vital).where(Vital.patient_id == patient_id).order_by(Vital.measured_at.desc()).limit(1)
    ).scalar_one_or_none()
    if latest_vital is None:
        return {}
    values: dict[str, float] = {}
    for field in ["heart_rate", "systolic_bp", "diastolic_bp", "respiratory_rate", "temperature_c", "oxygen_saturation"]:
        value = getattr(latest_vital, field, None)
        if value is not None:
            values[field] = float(value)
    return values


@app.get("/patients/{patient_id}/summary")
def patient_summary(patient_id: UUID, db: Session = Depends(get_db)) -> dict:
    patient = get_resource(Patient, patient_id, db)
    latest_encounter = db.execute(
        select(Encounter.started_at).where(Encounter.patient_id == patient_id).order_by(Encounter.started_at.desc()).limit(1)
    ).scalar_one_or_none()
    active_conditions = list(
        db.scalars(
            select(Condition.display)
            .where(Condition.patient_id == patient_id)
            .where(Condition.status != "resolved")
            .order_by(Condition.recorded_at.desc())
            .limit(10)
        )
    )
    return {
        "id": patient.id,
        "mrn": patient.mrn,
        "age": _patient_age(patient, latest_encounter),
        "sex": patient.sex,
        "ethnicity": patient.ethnicity,
        "smoking_status": patient.smoking_status,
        "active_conditions": active_conditions,
        "latest_vitals": _latest_patient_vitals(db, patient_id),
    }


def _compute_demo_examples(db: Session) -> dict[str, dict | None]:
    cache_key = "demo_examples"
    if hasattr(app.state, "demo_examples_cache") and app.state.demo_examples_cache:
        return app.state.demo_examples_cache

    patient_ids = list(db.scalars(select(Patient.id).order_by(Patient.id.asc())))
    sample_size = min(len(patient_ids), 200)
    selected: dict[str, dict | None] = {"low": None, "moderate": None, "high": None}
    scored: list[dict] = []
    for patient_id in patient_ids[:sample_size]:
        try:
            result = compute_patient_risk(db, patient_id, k=5)
        except HTTPException:
            continue
        scored.append({
            "patient_id": str(patient_id),
            "mrn": db.get(Patient, patient_id).mrn if db.get(Patient, patient_id) else None,
            "risk_score": float(result.risk_score),
            "risk_category": result.risk_category,
        })

    for item in sorted(scored, key=lambda item: item["risk_score"], reverse=True):
        category = item["risk_category"]
        if category in selected and selected[category] is None:
            selected[category] = {
                "patient_id": item["patient_id"],
                "mrn": item["mrn"],
                "risk_score": round(item["risk_score"], 5),
            }

    app.state.demo_examples_cache = selected
    return selected


@app.get("/demo/examples")
def demo_examples(db: Session = Depends(get_db)) -> dict[str, dict | None]:
    return _compute_demo_examples(db)


def create_resource(model: type[ModelT], payload: CreateT, db: Session) -> ModelT:
    resource = model(**payload.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


def get_resource(model: type[ModelT], resource_id: UUID, db: Session) -> ModelT:
    resource = db.get(model, resource_id)
    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    return resource


def list_resources(model: type[ModelT], db: Session, limit: int = 100, offset: int = 0) -> list[ModelT]:
    return list(db.scalars(select(model).order_by(model.id).limit(limit).offset(offset)))


def ensure_patient(patient_id: UUID, db: Session) -> None:
    if db.get(Patient, patient_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")


@app.post("/patients", response_model=PatientRead, status_code=status.HTTP_201_CREATED)
def create_patient(payload: PatientCreate, db: Session = Depends(get_db)) -> Patient:
    return create_resource(Patient, payload, db)


@app.get("/patients", response_model=list[PatientRead])
def list_patients(db: Session = Depends(get_db), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> list[Patient]:
    return list_resources(Patient, db, limit=limit, offset=offset)


@app.get("/patients/{patient_id}", response_model=PatientRead)
def get_patient(patient_id: UUID, db: Session = Depends(get_db)) -> Patient:
    return get_resource(Patient, patient_id, db)


@app.get("/patients/{patient_id}/risk", response_model=RiskResult)
def patient_risk(patient_id: UUID, db: Session = Depends(get_db), k: int = Query(5, ge=1, le=20), refresh: bool = False) -> RiskResult:
    return compute_patient_risk(db, patient_id, k=k, refresh=refresh)


@app.post("/encounters", response_model=EncounterRead, status_code=status.HTTP_201_CREATED)
def create_encounter(payload: EncounterCreate, db: Session = Depends(get_db)) -> Encounter:
    ensure_patient(payload.patient_id, db)
    return create_resource(Encounter, payload, db)


@app.get("/encounters", response_model=list[EncounterRead])
def list_encounters(db: Session = Depends(get_db), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> list[Encounter]:
    return list_resources(Encounter, db, limit=limit, offset=offset)


@app.get("/encounters/{resource_id}", response_model=EncounterRead)
def get_encounter(resource_id: UUID, db: Session = Depends(get_db)) -> Encounter:
    return get_resource(Encounter, resource_id, db)


@app.post("/conditions", response_model=ConditionRead, status_code=status.HTTP_201_CREATED)
def create_condition(payload: ConditionCreate, db: Session = Depends(get_db)) -> Condition:
    ensure_patient(payload.patient_id, db)
    return create_resource(Condition, payload, db)


@app.get("/conditions", response_model=list[ConditionRead])
def list_conditions(db: Session = Depends(get_db), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> list[Condition]:
    return list_resources(Condition, db, limit=limit, offset=offset)


@app.get("/conditions/{resource_id}", response_model=ConditionRead)
def get_condition(resource_id: UUID, db: Session = Depends(get_db)) -> Condition:
    return get_resource(Condition, resource_id, db)


@app.post("/lab-results", response_model=LabResultRead, status_code=status.HTTP_201_CREATED)
def create_lab_result(payload: LabResultCreate, db: Session = Depends(get_db)) -> LabResult:
    ensure_patient(payload.patient_id, db)
    return create_resource(LabResult, payload, db)


@app.get("/lab-results", response_model=list[LabResultRead])
def list_lab_results(db: Session = Depends(get_db), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> list[LabResult]:
    return list_resources(LabResult, db, limit=limit, offset=offset)


@app.get("/lab-results/{resource_id}", response_model=LabResultRead)
def get_lab_result(resource_id: UUID, db: Session = Depends(get_db)) -> LabResult:
    return get_resource(LabResult, resource_id, db)


@app.post("/vitals", response_model=VitalRead, status_code=status.HTTP_201_CREATED)
def create_vital(payload: VitalCreate, db: Session = Depends(get_db)) -> Vital:
    ensure_patient(payload.patient_id, db)
    return create_resource(Vital, payload, db)


@app.get("/vitals", response_model=list[VitalRead])
def list_vitals(db: Session = Depends(get_db), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> list[Vital]:
    return list_resources(Vital, db, limit=limit, offset=offset)


@app.get("/vitals/{resource_id}", response_model=VitalRead)
def get_vital(resource_id: UUID, db: Session = Depends(get_db)) -> Vital:
    return get_resource(Vital, resource_id, db)


@app.get("/risk-predictions/{resource_id}", response_model=RiskPredictionRead)
def get_risk_prediction(resource_id: UUID, db: Session = Depends(get_db)) -> RiskPrediction:
    return get_resource(RiskPrediction, resource_id, db)


@app.get("/patients/{patient_id}/risk-predictions", response_model=list[RiskPredictionRead])
def list_patient_risk_predictions(patient_id: UUID, db: Session = Depends(get_db), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)) -> list[RiskPrediction]:
    ensure_patient(patient_id, db)
    return list(db.scalars(select(RiskPrediction).where(RiskPrediction.patient_id == patient_id).order_by(RiskPrediction.predicted_at.desc()).limit(limit).offset(offset)))


def update_resource(model: type[ModelT], resource_id: UUID, payload: CreateT, db: Session) -> ModelT:
    resource = get_resource(model, resource_id, db)
    for field, value in payload.model_dump().items():
        setattr(resource, field, value)
    db.commit()
    db.refresh(resource)
    return resource


def delete_resource(model: type[ModelT], resource_id: UUID, db: Session) -> None:
    resource = get_resource(model, resource_id, db)
    db.delete(resource)
    db.commit()


@app.put("/patients/{patient_id}", response_model=PatientRead)
def update_patient(patient_id: UUID, payload: PatientCreate, db: Session = Depends(get_db)) -> Patient:
    return update_resource(Patient, patient_id, payload, db)


@app.delete("/patients/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(patient_id: UUID, db: Session = Depends(get_db)) -> None:
    delete_resource(Patient, patient_id, db)


@app.put("/encounters/{resource_id}", response_model=EncounterRead)
def update_encounter(resource_id: UUID, payload: EncounterCreate, db: Session = Depends(get_db)) -> Encounter:
    ensure_patient(payload.patient_id, db)
    return update_resource(Encounter, resource_id, payload, db)


@app.delete("/encounters/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_encounter(resource_id: UUID, db: Session = Depends(get_db)) -> None:
    delete_resource(Encounter, resource_id, db)


@app.put("/conditions/{resource_id}", response_model=ConditionRead)
def update_condition(resource_id: UUID, payload: ConditionCreate, db: Session = Depends(get_db)) -> Condition:
    ensure_patient(payload.patient_id, db)
    return update_resource(Condition, resource_id, payload, db)


@app.delete("/conditions/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_condition(resource_id: UUID, db: Session = Depends(get_db)) -> None:
    delete_resource(Condition, resource_id, db)


@app.put("/lab-results/{resource_id}", response_model=LabResultRead)
def update_lab_result(resource_id: UUID, payload: LabResultCreate, db: Session = Depends(get_db)) -> LabResult:
    ensure_patient(payload.patient_id, db)
    return update_resource(LabResult, resource_id, payload, db)


@app.delete("/lab-results/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lab_result(resource_id: UUID, db: Session = Depends(get_db)) -> None:
    delete_resource(LabResult, resource_id, db)


@app.put("/vitals/{resource_id}", response_model=VitalRead)
def update_vital(resource_id: UUID, payload: VitalCreate, db: Session = Depends(get_db)) -> Vital:
    ensure_patient(payload.patient_id, db)
    return update_resource(Vital, resource_id, payload, db)


@app.delete("/vitals/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vital(resource_id: UUID, db: Session = Depends(get_db)) -> None:
    delete_resource(Vital, resource_id, db)
