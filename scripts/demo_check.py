import argparse

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
        return all(key in data for key in ("low", "moderate", "high"))

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
        response = requests.get(f"{base_url}/patients/{patient_id}/risk?k=5&persist=false", timeout=20)
        if response.status_code != 200:
            return False
        payload = response.json()
        required = ["patient_id", "risk_score", "risk_category", "neighbors", "out_of_range"]
        return all(key in payload for key in required)

    def ui_ok() -> bool:
        response = requests.get(f"{base_url}/ui/", timeout=20)
        if response.status_code != 200:
            return False
        text = response.text.lower()
        return "vitalsense" in text and "js/main.js" in text and "css/tokens.css" in text

    def root_ok() -> bool:
        response = requests.get(f"{base_url}/", timeout=20, allow_redirects=False)
        return response.status_code in (307, 308) and response.headers.get("location") == "/ui/"

    def docs_ok() -> bool:
        return requests.get(f"{base_url}/docs", timeout=20).status_code == 200

    def static_ok() -> bool:
        css = requests.get(f"{base_url}/ui/css/tokens.css", timeout=20)
        js = requests.get(f"{base_url}/ui/js/main.js", timeout=20)
        return css.status_code == 200 and js.status_code == 200

    def overview_ok() -> bool:
        response = requests.get(f"{base_url}/stats/overview", timeout=30)
        if response.status_code != 200:
            return False
        required = ["patient_count", "encounter_count", "condition_count", "lab_count", "vital_count", "prediction_log_count", "category_counts", "avg_risk", "model_version", "weights", "thresholds", "data_span"]
        return all(key in response.json() for key in required)

    def results_ok() -> bool:
        response = requests.get(f"{base_url}/stats/results", timeout=30)
        if response.status_code != 200:
            return False
        required = ["score_histogram", "by_age", "by_sex", "by_smoking", "by_ethnicity", "top_conditions", "out_of_range_frequency", "score_components_sample", "top_risk_patients", "recent_predictions"]
        return all(key in response.json() for key in required)

    def search_ok() -> bool:
        response = requests.get(f"{base_url}/patients/search?q=", timeout=30)
        return response.status_code == 200 and all(key in response.json() for key in ("total", "items"))

    def metadata_ok() -> bool:
        response = requests.get(f"{base_url}/meta/tables", timeout=30)
        if response.status_code != 200:
            return False
        return {item["name"] for item in response.json()["tables"]} == {"patients", "encounters", "conditions", "lab_results", "vitals", "risk_predictions"}

    def table_sample_ok() -> bool:
        response = requests.get(f"{base_url}/meta/tables/patients/sample", timeout=20)
        return response.status_code == 200 and "items" in response.json()

    def history_ok() -> bool:
        response = requests.get(f"{base_url}/patients/search?q=&limit=1", timeout=30)
        if response.status_code != 200 or not response.json()["items"]:
            return False
        patient_id = response.json()["items"][0]["id"]
        history = requests.get(f"{base_url}/patients/{patient_id}/history", timeout=30)
        return history.status_code == 200 and all(key in history.json() for key in ("vitals", "labs", "encounters", "conditions"))

    checks = [
        ("/health", health_ok),
        ("/patients?limit=1", patient_list_ok),
        ("/demo/examples", examples_ok),
        ("/patients/{id}/summary", summary_ok),
        ("/patients/{id}/risk", risk_ok),
        ("/", root_ok),
        ("/docs", docs_ok),
        ("/ui/ and static assets", ui_ok),
        ("/ui/css + /ui/js", static_ok),
        ("/stats/overview", overview_ok),
        ("/stats/results", results_ok),
        ("/patients/search?q=", search_ok),
        ("/meta/tables", metadata_ok),
        ("/meta/tables/patients/sample", table_sample_ok),
        ("/patients/{id}/history", history_ok),
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
