# VitalSense

VitalSense is a lightweight clinical-risk demo built around a FastAPI backend and PostgreSQL data store. It loads the 2020-era Synthea sample dataset, models patient similarity using a transparent rule-based baseline, and surfaces a patient-level risk explanation with out-of-range clinical measures and neighboring patients.

## What it does

- Exposes patient records, encounters, conditions, vitals, lab results, and risk predictions over a small REST API.
- Computes a similarity-based risk score from patient age, sex, smoking status, latest vital signs, lab features, and active diagnoses.
- Shows the explanation for a score through `neighbors` and `out_of_range` fields in the `/patients/{id}/risk` response.
- Includes an offline multi-page demo UI served from `/ui/` for local review.

## Frontend
The offline vanilla-JS app lives in the top-level `frontend/` folder; run the backend and open `http://127.0.0.1:8000/`.
It uses `/stats/*`, `/patients/search`, `/patients/{id}/history`, `/meta/*`, and `/demo/examples` without a build step.

## Honest limitations

- This is a rule-based similarity baseline, not a trained clinical model.
- The project uses synthetic Synthea data from the 2020 sample distribution, not live patient records.
- The risk output is intended for demo and exploration, not real-world clinical decision support.

## Prerequisites

- PostgreSQL 14+ running locally
- Python 3.12
- PowerShell on Windows

## Windows PowerShell setup

1. Create the database:

```powershell
psql -U postgres -h localhost -d postgres -c "CREATE DATABASE vitalsense;"
```

2. Apply the schema:

```powershell
psql -U postgres -h localhost -d vitalsense -f .\backend\app\db\schema.sql
```

3. Set the database URL for this session:

```powershell
$env:DATABASE_URL = 'postgresql+psycopg2://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/vitalsense'
```

4. Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

5. Install dependencies:

```powershell
pip install -r requirements.txt
```

6. Seed the database:

```powershell
python .\scripts\seed.py
```

7. Start the API:

```powershell
cd backend
uvicorn app.main:app --reload
```

8. Open the app in a browser:

```text
http://127.0.0.1:8000
```

The root route redirects to `/ui`, and `/docs` remains available for the FastAPI schema.

## Demo script

1. Problem: identify patients with a higher risk profile from a sparse clinical dataset.
2. Data: use the Synthea sample data, seeded into PostgreSQL locally.
3. Live patient: open the UI and inspect a patient card and their risk explanation.
4. Explanation: review the risk score, out-of-range measures, and similar patients used to explain the prediction.
5. Roadmap: move from this transparent baseline to a graph-based GNN on Neo4j and add a fairness audit step.

## Roadmap

- Phase 2: GNN on Neo4j with patient and clinical relationship modeling
- Phase 3: fairness audit and calibration checks before any production use

## Notes

This repo is designed for local demo review and developer exploration. It is not a production clinical safety system.
