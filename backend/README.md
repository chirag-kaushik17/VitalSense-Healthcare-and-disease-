# VitalSense Backend

FastAPI + SQLAlchemy Phase 1 API for a local PostgreSQL-backed clinical dataset. It stores patients, encounters, conditions, lab results, vitals, and explanation-ready risk predictions.

Run from `backend/` with `uvicorn app.main:app --reload`. Set `DATABASE_URL` to a local PostgreSQL database first. This build uses the Synthea sample dataset and a synthetic fallback seed; Alembic and the older MIMIC demo flow are intentionally out of scope for Phase 1.
