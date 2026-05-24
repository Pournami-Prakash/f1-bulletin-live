import os
import sys
import time
from pathlib import Path
import snowflake.connector

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass  # CI sets env vars directly; dotenv not required


def execute_sql_file(path: str):
    print(f"\nRunning SQL file: {path}\n")

    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "F1_APP_WH"),
        database=os.environ.get("SNOWFLAKE_DATABASE", "F1_BULLETIN"),
        schema="MART",
        login_timeout=30,
    )

    with open(path, "r", encoding="utf-8") as f:
        full_sql = f.read()

    # split SQL statements
    statements = []
    for s in full_sql.split(";"):
        lines = [
            l for l in s.split("\n")
            if not l.strip().startswith("--")
        ]
        stmt = "\n".join(lines).strip()
        if stmt:
            statements.append(stmt)

    print(f"Detected {len(statements)} SQL statements\n")

    cur = conn.cursor()
    errors = []

    for i, stmt in enumerate(statements):

        preview = stmt[:80].replace("\n", " ")

        try:
            t0 = time.time()
            cur.execute(stmt)

            print(
                f"[{i+1:02d}] OK  {preview} "
                f"({cur.rowcount} rows, {time.time()-t0:.1f}s)"
            )

        except snowflake.connector.errors.ProgrammingError as e:

            err_str = str(e)

            if any(x in err_str for x in ["Nothing to insert", "already exists"]):
                print(f"[{i+1:02d}] SKIP {preview}")

            else:
                print(f"[{i+1:02d}] ERR  {err_str}")
                errors.append(err_str)

    cur.close()
    conn.close()

    print(f"\nFinished {path}. Errors: {len(errors)}\n")

    if errors:
        sys.exit(1)


if __name__ == "__main__":

    if len(sys.argv) < 2:
        print("Usage: python run_sql_file.py <sql_file>")
        sys.exit(1)

    sql_file = sys.argv[1]

    if not os.path.exists(sql_file):
        print(f"SQL file not found: {sql_file}")
        sys.exit(1)

    execute_sql_file(sql_file)
