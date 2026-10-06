import argparse
import sys

import requests


DEFAULT_BASE_URL = "http://127.0.0.1:8000"


def check(name, fn):
    try:
        ok = fn()
        status = "PASS" if ok else "FAIL"
        print(f"{status} {name}")
        return ok
    except Exception as exc:  # pragma: no cover - smoke script only
        print(f"FAIL {name}: {exc}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Run VitalSense smoke checks against the demo API.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Base URL for the FastAPI service")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    failures = 0

    def health_ok() -> bool:
        response = requests.get(f"{base_url}/health", timeout=20)
        return response.status_code == 200 and response.json().get("status") == "ok"

    def patient_list_ok() -> bool:
        response = requests.get(f"{base_url}/patients?limit=1", timeout=20)
        if response.status_code != 200:
            return False
        data = response.json()
        return isinstance(data, list) and len(data) >= 1 and "id" in data[0]

    def examples_ok() -> bool:
        response = requests.get(f"{base_url}/demo/examples", timeout=20)
        if response.status_code != 200:
            return False
        data = response.json()
        required = ["low", "moderate", "high"]
        if not all(key in data for key in required):
            return False
        return True

    def summary_ok() -> bool:
        patient_response = requests.get(f"{base_url}/patients?limit=1", timeout=20)
        patient_data = patient_response.json()
        if patient_response.status_code != 200 or not patient_data:
            return False
        patient_id = patient_data[0]["id"]
        response = requests.get(f"{base_url}/patients/{patient_id}/summary", timeout=20)
        if response.status_code != 200:
            return False
        payload = response.json()
        required = ["id", "mrn", "age", "sex", "ethnicity", "smoking_status", "active_conditions", "latest_vitals"]
        return all(key in payload for key in required)

    def risk_ok() -> bool:
        patient_response = requests.get(f"{base_url}/patients?limit=1", timeout=20)
        patient_data = patient_response.json()
        if patient_response.status_code != 200 or not patient_data:
            return False
        patient_id = patient_data[0]["id"]
        response = requests.get(f"{base_url}/patients/{patient_id}/risk?k=5", timeout=20)
        if response.status_code != 200:
            return False
        payload = response.json()
        required = ["patient_id", "risk_score", "risk_category", "neighbors", "out_of_range"]
        return all(key in payload for key in required)

    def ui_ok() -> bool:
        response = requests.get(f"{base_url}/ui", timeout=20)
        if response.status_code != 200:
            return False
        text = response.text.lower()
        return "vitalsense" in text and "patient risk explorer" in text

    checks = [
        ("/health", health_ok),
        ("/patients?limit=1", patient_list_ok),
        ("/demo/examples", examples_ok),
        ("/patients/{id}/summary", summary_ok),
        ("/patients/{id}/risk", risk_ok),
        ("/ui", ui_ok),
    ]

    for name, fn in checks:
        passed = check(name, fn)
        if not passed:
            failures += 1

    if failures:
        print(f"SMOKE CHECKS FAILED: {failures} issue(s)")
        return 1

    print("ALL CHECKS PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
