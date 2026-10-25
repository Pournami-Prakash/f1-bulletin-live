"""Ingest observed practice, report tyre diagnostics, and freeze a separate shadow forecast.

python etl/prediction/tyre_shadow.py --season 2026 --round 18 --persist
Use --input-dir for previously downloaded provider payloads; --history-dir for
explicitly exploratory local research inputs. Production predictions are never written.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extras import Json, RealDictCursor
from dotenv import load_dotenv

from openf1_weekend import get
from tyre_observations import normalize, persist
from tyre_analysis import analyze, dumps, strategy_sensitivity, PROTOCOL_VERSION, protocol_manifest
from tyre_challenger import practice_features, forecast_pair, metrics, paired_summary, KEYS, TYRE_FEATURES

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT/'web/.env.local')


def connect():
    return psycopg2.connect(os.environ['NEON_DATABASE_URL'], connect_timeout=30)


def calendar(season, number):
    with connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT * FROM race_calendar WHERE season=%s AND round=%s', (season, number))
        result = cur.fetchone()
    if not result or result['race_start_utc'] is None:
        raise ValueError('Verified race calendar unavailable')
    return dict(result)


def collect(event, input_dir=None):
    start = pd.Timestamp(event['race_start_utc'])
    if input_dir:
        sessions = []
        for path in Path(input_dir).glob('sessions_*.json'):
            sessions.extend(json.loads(path.read_text()))
    else:
        sessions = get('sessions', year=event['season'])
    candidates = [s for s in sessions if s['session_name'] in {'Practice 1', 'Practice 2', 'Practice 3'}
                  and s['location'].casefold() == event['city'].casefold()
                  and start-pd.Timedelta(days=5) <= pd.Timestamp(s['date_start']) < start
                  and pd.Timestamp(s['date_end']) <= pd.Timestamp.now(tz='UTC') and not s.get('is_cancelled')]
    if not candidates or len({s['meeting_key'] for s in candidates}) != 1:
        raise ValueError('Cannot uniquely identify completed practice sessions')
    batches, observations = [], []
    for session in sorted(candidates, key=lambda s:s['date_start']):
        payload = {'sessions': [session]}
        for endpoint in ['laps', 'stints', 'drivers', 'race_control', 'weather']:
            payload[endpoint] = (json.loads((Path(input_dir)/f'{endpoint}_{session["session_key"]}.json').read_text())
                                 if input_dir else get(endpoint, session_key=session['session_key']))
        batch, rows = normalize(payload, event['season'], event['round'], start)
        batches.append((batch, rows)); observations.extend(rows)
    return batches, observations


def historical_rows(directory):
    """Adapt existing research observations without fabricating provider flags or provenance."""
    from tyre_observations import allocation
    raw = pd.read_parquet(Path(directory)/'practice_raw.parquet')
    races = pd.read_parquet(Path(directory)/'races.parquet')[['season','round','circuit']].drop_duplicates()
    raw = raw.merge(races, on=['season','round'], how='left', validate='many_to_one')
    rows = []
    for r in raw.itertuples():
        reasons = []
        if pd.isna(r.lap_time_ms) or r.lap_time_ms <= 0: reasons.append('missing_lap_time')
        if pd.notna(r.pit_in_time_ms) or pd.notna(r.pit_out_time_ms): reasons.append('pit_lap')
        if not r.is_accurate or r.deleted or str(r.track_status) != '1': reasons.append('research_quality_flag')
        if r.compound not in ['SOFT','MEDIUM','HARD'] or pd.isna(r.tyre_life) or pd.isna(r.stint): reasons.append('missing_tyre')
        rows.append(dict(season=int(r.season), round=int(r.round), circuit=r.circuit,
                         session_key=int(r.season)*1000+int(r.round)*10+int(r.fp_session[-1]), fp_session=r.fp_session,
                         driver_code=r.driver_code, stint=r.stint, lap_number=int(r.lap_number),
                         lap_time_ms=r.lap_time_ms if pd.notna(r.lap_time_ms) else None,
                         tyre_life=r.tyre_life if pd.notna(r.tyre_life) else None,
                         compound=r.compound, session_time_s=r.session_time_s, track_temp=None,
                         eligible=not reasons, exclusion_reasons=reasons, traffic_status='unknown',
                         source='retrospective normalized research archive', **allocation(r.season, r.circuit, r.compound)))
    return rows


def database_features(event):
    """Use the robust model's feature builder under the same target-race boundary."""
    import robust_model
    from robust_features import build
    os.environ['F1_ASOF_ROUND'] = f'{event["season"]}:{event["round"]}'
    with connect() as conn:
        race, quali, sprint, weather, laps = robust_model._history(conn)
    earlier = (race.season < event['season']) | ((race.season == event['season']) & (race['round'] < event['round']))
    race = race[earlier].copy()
    current = quali[(quali.season == event['season']) & (quali['round'] == event['round'])].copy()
    if current.empty or current.driver_code.duplicated().any() or current.quali_pos.isna().any():
        raise ValueError('Complete unique qualifying data required for shadow forecast')
    teams = race.sort_values(['season','round']).groupby('driver_code').team.last()
    target = current.assign(gp_name=event['race_name'], circuit=event['city'], date=pd.NaT,
                            team=current.driver_code.map(teams).fillna('Unknown'),
                            finish_position=np.nan, points=0., status='')
    race = race.merge(quali, on=KEYS, how='left')
    data = pd.concat([race, target], ignore_index=True).merge(sprint, on=KEYS, how='left').merge(weather, on=['season','round'], how='left')
    return build(data, robust_model.race_pace(laps))


def earlier_observations(event, cutoff):
    with connect() as conn, conn.cursor() as cur:
        cur.execute('''WITH selected AS (
            SELECT DISTINCT ON (season,round,session_key) id FROM practice_observation_batches
            WHERE (season < %s OR (season=%s AND round < %s)) AND retrieved_at <= %s
            ORDER BY season,round,session_key,retrieved_at DESC)
            SELECT observation FROM practice_lap_observations p JOIN selected s ON s.id=p.batch_id''',
            (event['season'],event['season'],event['round'],cutoff))
        return [r[0] for r in cur.fetchall()]


def published_snapshot(event):
    with connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('''SELECT driver_code,predicted_position,win_probability,podium_probability,
            model_version,predicted_at FROM predictions WHERE season=%s AND round=%s
            AND model_version LIKE 'prod_%%' ORDER BY predicted_at DESC,predicted_position''', (event['season'],event['round']))
        rows = [dict(r) for r in cur.fetchall()]
    if not rows: return []
    version = rows[0]['model_version']
    return json.loads(dumps([r for r in rows if r['model_version']==version]))


def range_history(event):
    with connect() as conn, conn.cursor() as cur:
        cur.execute('''SELECT DISTINCT ON (season,round) season,round,predictions,scores,report
            FROM tyre_shadow_runs WHERE kind='prospective' AND scores IS NOT NULL AND protocol_version=%s
            AND (season < %s OR (season=%s AND round < %s))
            ORDER BY season,round,created_at DESC''',
            (PROTOCOL_VERSION,event['season'],event['season'],event['round']))
        return [dict(season=season,round=number,actual=scores['actual_positions'],
                     **{name:predictions[name] for name in ['baseline','challenger']})
                for season,number,predictions,scores,report in cur.fetchall()
                if scores.get('actual_positions') and report.get('protocol')==protocol_manifest()]


def save_run(event, report, predictions, cutoff, kind):
    # Created/ingested time is part of identity: immutable prospective forecasts
    # survive later refreshes, outcome publication and source corrections.
    identity = dumps(dict(protocol=PROTOCOL_VERSION, cutoff=cutoff.isoformat(), predictions=predictions, batches=report['batch_ids']))
    run_id = hashlib.sha256(identity.encode()).hexdigest()
    with connect() as conn, conn.cursor() as cur:
        cur.execute('''INSERT INTO tyre_shadow_runs
            (id,season,round,forecast_cutoff,race_start,protocol_version,kind,report,predictions)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
            (run_id,event['season'],event['round'],cutoff.to_pydatetime(),event['race_start_utc'],PROTOCOL_VERSION,kind,
             Json(json.loads(dumps(report))),Json(json.loads(dumps(predictions)))))
    return run_id


def score_event(event):
    if pd.Timestamp.now(tz='UTC') < pd.Timestamp(event['race_start_utc'])+pd.Timedelta(hours=2):
        raise ValueError('Race is not complete; shadow scoring deferred')
    with connect() as conn, conn.cursor() as cur:
        cur.execute('''SELECT r.driver_code,r.finish_position FROM results r JOIN sessions s ON s.id=r.session_id
            WHERE s.season=%s AND s.round=%s AND s.session_type='R' AND r.finish_position IS NOT NULL''', (event['season'],event['round']))
        actual = dict(cur.fetchall())
        cur.execute('SELECT id,predictions,kind,forecast_cutoff,protocol_version FROM tyre_shadow_runs WHERE season=%s AND round=%s AND scores IS NULL',
                    (event['season'],event['round']))
        pending = cur.fetchall()
        scored = []
        for run_id, predictions, kind, cutoff, protocol in pending:
            if kind != 'prospective' or pd.Timestamp(cutoff) >= pd.Timestamp(event['race_start_utc']):
                continue
            scores = {name:metrics(predictions[name], actual) for name in ['baseline','challenger']}
            scores['kind'] = 'prospective'; scores['protocol_version'] = protocol
            scores['actual_positions'] = actual
            cur.execute('UPDATE tyre_shadow_runs SET scores=%s,scored_at=now() WHERE id=%s AND scores IS NULL', (Json(scores),run_id))
            scored.append(dict(run_id=run_id, **scores))
    return scored


def write_report(output, report, predictions, observations):
    output.mkdir(parents=True, exist_ok=True)
    (output/'diagnostics.json').write_text(dumps(report)+'\n')
    (output/'shadow_predictions.json').write_text(dumps(predictions)+'\n')
    (output/'observations.json').write_text(dumps(observations)+'\n')
    flat = [{k:s.get(k) for k in ['driver_code','fp_session','stint','compound','tyre_spec','status','n_fit_laps',
                                  'raw_slope_ms_per_lap','selected_rate_ms_per_lap','fallback_reason']} for s in report['stints']]
    pd.DataFrame(flat).to_csv(output/'stints.csv',index=False)
    pd.DataFrame(report['curves']).to_csv(output/'fuel_sensitivity.csv',index=False)
    pd.DataFrame(report['strategy_scenarios']).to_csv(output/'strategy_scenarios.csv',index=False)
    lines = [f'# {report["event"]} — tyre evidence and shadow forecast', '',
             f'Protocol: {PROTOCOL_VERSION}. Source: observed OpenF1 practice. Published forecasts are unchanged.', '',
             f'{report["total_laps"]} observed laps; {report["eligible_laps"]} pass provider-quality screening.',
             f'{sum(s["status"]=="fitted" for s in report["stints"])} fitted stints; fuel and traffic remain unobserved.', '',
             '## Conditional pace-loss estimates', '',
             '| Driver | Session | Compound | Fit laps | Raw ms/lap | Selected ms/lap | Fallback reason |',
             '|---|---|---|---:|---:|---:|---|']
    for s in report['stints']:
        raw = f'{s["raw_slope_ms_per_lap"]:.1f}' if s['raw_slope_ms_per_lap'] is not None else 'unknown'
        lines.append(f'| {s["driver_code"]} | {s["fp_session"]} | {s["tyre_spec"] or s["compound"]+" (identity unknown)"} | {s["n_fit_laps"]} | {raw} | {s["selected_rate_ms_per_lap"]:.1f} | {s["fallback_reason"] or "none"} |')
    lines += ['', '## Interpretation', '', *['- '+s for s in report['limitations']], '',
              'Strategy windows are isolated dry scenarios using explicit compound offsets and pit-loss assumptions; they are not race recommendations.',
              'Bootstrap intervals are conditional on assumed fuel and accepted laps. Sparse stints do not support precise intervals.', '',
              '## Shadow comparison', '', f'Challenger status: {predictions.get("challenger_status", "unavailable")}.',
              'The comparison refits the robust model family with and without tyre features. It does not reproduce the entire calibrated production stack.',
              'An as-issued production snapshot is saved separately. Retrospective research is not an untouched holdout.', '',
              'Downloads: [observations and exclusion reasons](observations.json), [diagnostics](diagnostics.json), [stints](stints.csv), [fuel sensitivity](fuel_sensitivity.csv), [strategy scenarios](strategy_scenarios.csv), [shadow forecasts](shadow_predictions.json).']
    (output/'REPORT.md').write_text('\n'.join(lines)+'\n')
    plot_report(output, report)


def plot_report(output, report):
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except ImportError:
        return  # Numeric diagnostics and report do not require plotting dependencies.
    fitted = sorted([s for s in report['stints'] if s['status']=='fitted'], key=lambda s:s['n_fit_laps'], reverse=True)
    if not fitted: return
    s = fitted[0]; fit = next(f for f in s['scenarios'] if f['fuel_ms_per_lap']==28)
    fig, ax = plt.subplots(2,1,figsize=(9,6),sharex=True,layout='constrained')
    ax[0].scatter(fit['tyre_age_completed'],np.array(fit['observed_ms'])/1000,label='Observed accepted laps')
    ax[0].plot(fit['tyre_age_completed'],np.array(fit['fitted_observed_ms'])/1000,label='Robust conditional fit',color='darkorange')
    ax[0].set(ylabel='Lap time (s)',title=f'{s["driver_code"]} {s["fp_session"]} {s["compound"]}: assumed fuel gain 0.028 s/lap')
    ax[0].legend();ax[1].axhline(0,color='gray',linewidth=1)
    ax[1].scatter(fit['tyre_age_completed'],np.array(fit['residual_ms'])/1000)
    ax[1].set(xlabel='Completed tyre age (laps)',ylabel='Residual (s)')
    fig.savefig(output/'stint_diagnostics.png',dpi=170);plt.close(fig)
    fig, ax = plt.subplots(figsize=(9,5),layout='constrained')
    for s in fitted[:8]:
        ax.plot([f['fuel_ms_per_lap']/1000 for f in s['scenarios']],
                [f['raw_slope_ms_per_lap']/1000 for f in s['scenarios']],marker='.',label=f'{s["driver_code"]} {s["fp_session"]} {s["compound"]}')
    ax.axhline(0,color='gray',linewidth=1);ax.set(xlabel='Assumed fuel gain (s/race lap)',ylabel='Conditional pace loss (s/tyre lap)',title='Sensitivity to fuel assumption — selected long stints')
    ax.legend(fontsize=8);fig.savefig(output/'fuel_sensitivity.png',dpi=170);plt.close(fig)
    with (output/'REPORT.md').open('a') as file:
        file.write('\n![Observed stint and residuals](stint_diagnostics.png)\n\n![Fuel sensitivity](fuel_sensitivity.png)\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season',type=int,required=True);parser.add_argument('--round',type=int,required=True,dest='number')
    parser.add_argument('--input-dir');parser.add_argument('--history-dir');parser.add_argument('--persist',action='store_true')
    parser.add_argument('--score',action='store_true');parser.add_argument('--output')
    args = parser.parse_args();event = calendar(args.season,args.number)
    if args.score:
        print(dumps(score_event(event)));return
    race_start = pd.Timestamp(event['race_start_utc'])
    batches, rows = collect(event,args.input_dir)
    cutoff = pd.Timestamp.now(tz='UTC')
    if args.persist:
        with connect() as conn:
            for batch, observations in batches: persist(conn,batch,observations)
    report = analyze(rows);report['strategy_scenarios'] = strategy_sensitivity(report,event['race_laps'])
    report.update(event=event['race_name'], forecast_cutoff=cutoff.isoformat(), race_start=race_start.isoformat(),
                  batch_ids=[b['id'] for b,_ in batches], source_sessions=[dict(session_key=b['session_key'],retrieved_at=b['retrieved_at'],session_end=b['session_end']) for b,_ in batches])
    data = database_features(event)
    historical = historical_rows(args.history_dir) if args.history_dir else earlier_observations(event,cutoff)
    earlier = [r for r in historical if (r['season'],r['round']) < (args.season,args.number)]
    evidence = practice_features(earlier+rows)
    data = data.merge(evidence,on=KEYS,how='left',validate='one_to_one')
    target = data[(data.season==args.season)&(data['round']==args.number)].sort_values('driver_code')
    predictions = forecast_pair(data,target,range_history(event))
    from prospective_gate import qualifying_order
    predictions['qualifying'] = qualifying_order(target)
    predictions['published_snapshot'] = published_snapshot(event)
    predictions['input_mode'] = 'retrospective research archive' if args.history_dir else 'versioned observation database'
    try: report['code_revision'] = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    except subprocess.CalledProcessError: report['code_revision'] = None
    # Research archives lack as-issued retrieval proof: never label those forecasts prospective.
    report['observation_cutoff'] = cutoff.isoformat()
    cutoff = pd.Timestamp.now(tz='UTC')
    report['forecast_cutoff'] = cutoff.isoformat()
    kind = 'prospective' if cutoff < race_start and not args.history_dir else 'historical_reconstruction'
    report['kind'] = kind
    if args.persist: report['shadow_run_id'] = save_run(event,report,predictions,cutoff,kind)
    output = Path(args.output) if args.output else ROOT/'artifacts/tyre-analysis'/f'{args.season}-{args.number}'
    write_report(output,report,predictions,rows)
    print(dumps(dict(output=str(output),observed_laps=len(rows),fitted_stints=sum(s['status']=='fitted' for s in report['stints']),
                     shadow_status=predictions['challenger_status'],kind=kind)))


if __name__ == '__main__':
    main()
