from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Index, JSON, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    pass


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    mrn: Mapped[str | None] = mapped_column(String(64), unique=True)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    sex: Mapped[str] = mapped_column(String(32), nullable=False)
    ethnicity: Mapped[str] = mapped_column(String(128), nullable=False)
    smoking_status: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    encounters: Mapped[list["Encounter"]] = relationship(back_populates="patient", cascade="all, delete-orphan")
    conditions: Mapped[list["Condition"]] = relationship(back_populates="patient", cascade="all, delete-orphan")
    lab_results: Mapped[list["LabResult"]] = relationship(back_populates="patient", cascade="all, delete-orphan")
    vitals: Mapped[list["Vital"]] = relationship(back_populates="patient", cascade="all, delete-orphan")
    risk_predictions: Mapped[list["RiskPrediction"]] = relationship(back_populates="patient", cascade="all, delete-orphan")


class Encounter(Base):
    __tablename__ = "encounters"
    __table_args__ = (Index("ix_encounters_patient_id", "patient_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    encounter_type: Mapped[str] = mapped_column(String(64), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str | None] = mapped_column(Text)

    patient: Mapped[Patient] = relationship(back_populates="encounters")


class Condition(Base):
    __tablename__ = "conditions"
    __table_args__ = (Index("ix_conditions_patient_id", "patient_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    display: Mapped[str] = mapped_column(String(256), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")

    patient: Mapped[Patient] = relationship(back_populates="conditions")


class LabResult(Base):
    __tablename__ = "lab_results"
    __table_args__ = (Index("ix_lab_results_patient_id", "patient_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    test_code: Mapped[str] = mapped_column(String(64), nullable=False)
    test_name: Mapped[str] = mapped_column(String(256), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reference_low: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    reference_high: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))

    patient: Mapped[Patient] = relationship(back_populates="lab_results")


class Vital(Base):
    __tablename__ = "vitals"
    __table_args__ = (Index("ix_vitals_patient_id", "patient_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    heart_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    systolic_bp: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    diastolic_bp: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    respiratory_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    temperature_c: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    oxygen_saturation: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))

    patient: Mapped[Patient] = relationship(back_populates="vitals")


class RiskPrediction(Base):
    __tablename__ = "risk_predictions"
    __table_args__ = (Index("ix_risk_predictions_patient_id", "patient_id"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    risk_score: Mapped[Decimal] = mapped_column(Numeric(6, 5), nullable=False)
    risk_category: Mapped[str] = mapped_column(String(16), nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    top_similar_patients: Mapped[list] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=list)
    explanation: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=dict)
    predicted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    patient: Mapped[Patient] = relationship(back_populates="risk_predictions")
