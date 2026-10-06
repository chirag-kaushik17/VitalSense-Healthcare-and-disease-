# Seed scripts

`python scripts/seed.py --source synthetic --count 100` creates simulated patients.

`python scripts/seed.py --source synthea --data-dir <synthea-output-dir>` loads native Synthea `patients.csv`, `encounters.csv`, `conditions.csv`, and `observations.csv` exports. The default run downloads the sample archive if it is not already present under `data/synthea_sample`.
