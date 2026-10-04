"""Query-local historical session boundary, safe with transaction poolers."""
import os


def bounded_sql(sql):
    boundary = os.environ.get("F1_ASOF_ROUND")
    if not boundary:
        return sql
    season, round_number = map(int, boundary.split(":"))
    # Only validated integers are interpolated; existing query parameters stay intact.
    prefix = f"""WITH sessions AS (
        SELECT * FROM public.sessions
        WHERE season < {season} OR (season = {season} AND round < {round_number})
           OR (season = {season} AND round = {round_number}
               AND session_type IN ('FP1', 'FP2', 'FP3', 'Q', 'S', 'SQ'))
    ) """
    query = sql.lstrip()
    return prefix + (", " + query[4:].lstrip() if query.split(None, 1)[0].upper() == "WITH" else query)
