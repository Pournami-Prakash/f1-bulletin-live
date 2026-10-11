"""Pull a leak-free research table: one row per driver per race, qualifying-time info only."""
import os
from pathlib import Path
import pandas as pd
import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "web" / ".env.local")
conn = psycopg2.connect(os.environ["NEON_DATABASE_URL"])
q = lambda sql: pd.read_sql(sql, conn)

race = q("""SELECT s.season, s.round, s.gp_name, s.circuit, s.date, r.driver_code, r.team,
                   r.finish_position, r.points, COALESCE(r.status,'') AS status
            FROM results r JOIN sessions s ON s.id=r.session_id
            WHERE s.session_type='R' AND s.season>=2021""")
quali = q("""SELECT s.season, s.round, ql.driver_code, ql.grid_position AS quali_pos, ql.gap_to_pole_ms,
                    ql.q1_ms, ql.q2_ms, ql.q3_ms, ql.best_ms
             FROM qualifying_laps ql JOIN sessions s ON s.id=ql.session_id
             WHERE s.session_type='Q' AND s.season>=2021""")
sprint = q("""SELECT s.season, s.round, r.driver_code, r.finish_position AS sprint_pos, r.points AS sprint_points
              FROM results r JOIN sessions s ON s.id=r.session_id WHERE s.session_type='S' AND s.season>=2021""")
wx = q("""SELECT s.season, s.round, AVG(w.track_temp)::float AS q_track_temp, AVG(w.air_temp)::float AS q_air_temp,
                 BOOL_OR(COALESCE(w.rainfall,FALSE))::int AS q_rain
          FROM weather w JOIN sessions s ON s.id=w.session_id WHERE s.session_type='Q' GROUP BY 1,2""")
df = race.merge(quali, on=["season", "round", "driver_code"], how="left") \
         .merge(sprint, on=["season", "round", "driver_code"], how="left") \
         .merge(wx, on=["season", "round"], how="left")
df.to_parquet(Path(__file__).with_name("races.parquet"), index=False)
print(df.shape, df.groupby("season")["round"].nunique().to_dict())
print(df.isna().mean().round(3).to_dict())
print(df.status.value_counts().head(8).to_dict())
