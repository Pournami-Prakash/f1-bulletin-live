"""Race pace per driver per race, relative to the field lap-by-lap (cancels fuel load, track evolution, SC)."""
import os
from pathlib import Path
import numpy as np, pandas as pd, psycopg2
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / "web" / ".env.local")
c = psycopg2.connect(os.environ["NEON_DATABASE_URL"])
laps = pd.read_sql("""SELECT s.season, s.round, l.driver_code, l.lap_number, l.lap_time_ms, l.pit_in_time_ms, l.pit_out_time_ms, l.compound
                      FROM laps l JOIN sessions s ON s.id=l.session_id WHERE s.session_type='R' AND s.season>=2021""", c)
laps = laps[laps.lap_time_ms.notna() & laps.pit_in_time_ms.isna() & laps.pit_out_time_ms.isna() & (laps.lap_number > 1)]
g = laps.groupby(["season", "round", "lap_number"])["lap_time_ms"]
laps["field"] = g.transform("median")
laps["n_lap"] = g.transform("size")
laps = laps[(laps.n_lap >= 10) & (laps.lap_time_ms < laps.field * 1.07)]  # drop slow/SC/incident laps
laps["rel"] = (laps.lap_time_ms / laps.field - 1) * 100
out = laps.groupby(["season", "round", "driver_code"]).agg(pace=("rel", "median"), pace_laps=("rel", "size"),
                                                           pace_sd=("rel", "std")).reset_index()
out = out[out.pace_laps >= 10]
out.to_parquet(Path(__file__).with_name("pace.parquet"), index=False)
print(out.shape, out.pace.describe().round(3).to_dict())
