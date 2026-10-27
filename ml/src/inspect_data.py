
from pathlib import Path
import pandas as pd

raw = Path(__file__).resolve().parents[1] / "data" / "raw"

for name in ["phishing.csv", "tranco.csv"]:
    path = raw / name

    if not path.exists():
        print(f"{name}: File not found")
        continue

    if name == "phishing.csv":
        df = pd.read_csv(path, nrows=5)
    else:
        df = pd.read_csv(
            path, header=None,
            names=["rank", "domain"], nrows=5
        )

    print(f"\n{name}")
    print("Columns:", df.columns.tolist())
    print("Preview loaded:", len(df), "rows")
    print("Missing values:", df.isna().sum().to_dict())
