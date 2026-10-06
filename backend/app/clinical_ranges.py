VITAL_RANGES = {
    "heart_rate": {"low": 60.0, "high": 100.0},
    "systolic_bp": {"low": 90.0, "high": 130.0},
    "diastolic_bp": {"low": 60.0, "high": 85.0},
    "respiratory_rate": {"low": 12.0, "high": 20.0},
    "temperature_c": {"low": 36.1, "high": 37.8},
    "oxygen_saturation": {"low": 94.0, "high": None},
}

LAB_RANGES = {
    "2339-0": {"name": "glucose", "low": 70.0, "high": 99.0},
    "2160-0": {"name": "creatinine", "low": 0.6, "high": 1.2},
    "2093-3": {"name": "total_cholesterol", "low": 0.0, "high": 200.0},
    "18262-6": {"name": "ldl", "low": 0.0, "high": 100.0},
    "2085-9": {"name": "hdl", "low": 40.0, "high": 80.0},
    "2571-8": {"name": "triglycerides", "low": 0.0, "high": 150.0},
    "4548-4": {"name": "hba1c", "low": 4.0, "high": 5.7},
    "718-7": {"name": "hemoglobin", "low": 12.0, "high": 17.0},
    "39156-5": {"name": "bmi", "low": 18.5, "high": 24.9},
}

KEY_LAB_CODES = list(LAB_RANGES.keys())

CONDITION_KEYWORDS = {
    "hypertension": ["hypertension", "high blood pressure"],
    "diabetes": ["diabetes", "type 2 diabetes", "type 1 diabetes", "diabetic"],
    "chronic_kidney": ["chronic kidney disease", "kidney disease", "renal failure"],
    "heart_failure": ["heart failure"],
    "coronary": ["coronary", "coronary artery disease"],
    "asthma": ["asthma"],
    "copd": ["copd", "chronic obstructive pulmonary disease"],
    "stroke": ["stroke", "cerebrovascular accident"],
}

SMOKING_STATUS_MAP = {"never": 0, "former": 1, "current": 2}
