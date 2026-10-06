from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PatientCreate(BaseModel):
    mrn: str | None = Field(default=None, min_length=1, max_length=64)
    date_of_birth: date
    sex: str = Field(min_length=1, max_length=32)
    ethnicity: str = Field(min_length=1, max_length=128)
    smoking_status: str | None = Field(default=None, min_length=1, max_length=32)


class PatientRead(PatientCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime


class EncounterCreate(BaseModel):
    patient_id: UUID
    encounter_type: str = Field(min_length=1, max_length=64)
    started_at: datetime
    ended_at: datetime | None = None
    reason: str | None = None


class EncounterRead(EncounterCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class ConditionCreate(BaseModel):
    patient_id: UUID
    code: str = Field(min_length=1, max_length=32)
    display: str = Field(min_length=1, max_length=256)
    recorded_at: datetime
    status: str = Field(default="active", min_length=1, max_length=32)


class ConditionRead(ConditionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class LabResultCreate(BaseModel):
    patient_id: UUID
    test_code: str = Field(min_length=1, max_length=64)
    test_name: str = Field(min_length=1, max_length=256)
    value: Decimal
    unit: str = Field(min_length=1, max_length=32)
    measured_at: datetime
    reference_low: Decimal | None = None
    reference_high: Decimal | None = None


class LabResultRead(LabResultCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class VitalCreate(BaseModel):
    patient_id: UUID
    measured_at: datetime
    heart_rate: Decimal | None = None
    systolic_bp: Decimal | None = None
    diastolic_bp: Decimal | None = None
    respiratory_rate: Decimal | None = None
    temperature_c: Decimal | None = None
    oxygen_saturation: Decimal | None = None


class VitalRead(VitalCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class RiskPredictionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    patient_id: UUID
    risk_score: Decimal
    risk_category: str
    model_version: str
    top_similar_patients: list[dict]
    explanation: dict
    predicted_at: datetime


class RiskNeighbor(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    patient_id: UUID
    similarity: float
    own_risk: float
    high_risk: bool


class RiskOutOfRange(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    measure: str
    value: float
    low: float | None = None
    high: float | None = None


class RiskResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    patient_id: UUID
    risk_score: float
    risk_category: str
    own_risk: float
    neighbor_high_risk_fraction: float
    model_version: str
    neighbors: list[RiskNeighbor]
    out_of_range: list[RiskOutOfRange]
