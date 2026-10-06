CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS risk_predictions, vitals, lab_results, conditions, encounters, patients CASCADE;

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mrn VARCHAR(64) UNIQUE,
    date_of_birth DATE NOT NULL,
    sex VARCHAR(32) NOT NULL,
    ethnicity VARCHAR(128) NOT NULL,
    smoking_status VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_type VARCHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    reason TEXT
);
CREATE INDEX ix_encounters_patient_id ON encounters(patient_id);

CREATE TABLE conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    display VARCHAR(256) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active'
);
CREATE INDEX ix_conditions_patient_id ON conditions(patient_id);

CREATE TABLE lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    test_code VARCHAR(64) NOT NULL,
    test_name VARCHAR(256) NOT NULL,
    value NUMERIC(12, 4) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL,
    reference_low NUMERIC(12, 4),
    reference_high NUMERIC(12, 4)
);
CREATE INDEX ix_lab_results_patient_id ON lab_results(patient_id);

CREATE TABLE vitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    measured_at TIMESTAMPTZ NOT NULL,
    heart_rate NUMERIC(8, 2),
    systolic_bp NUMERIC(8, 2),
    diastolic_bp NUMERIC(8, 2),
    respiratory_rate NUMERIC(8, 2),
    temperature_c NUMERIC(6, 2),
    oxygen_saturation NUMERIC(6, 2)
);
CREATE INDEX ix_vitals_patient_id ON vitals(patient_id);

CREATE TABLE risk_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    risk_score NUMERIC(6, 5) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
    risk_category VARCHAR(16) NOT NULL CHECK (risk_category IN ('low', 'moderate', 'high')),
    model_version VARCHAR(64) NOT NULL,
    top_similar_patients JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_risk_predictions_patient_id ON risk_predictions(patient_id);
