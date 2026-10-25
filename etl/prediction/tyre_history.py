"""Append previously downloaded OpenF1 practice payloads with honest retrieval times.

Requires the original provider JSON, not reconstructed or synthetic lap records.
Event names and meeting IDs are checked before assigning any season/round.
"""
import argparse
import json
from pathlib import Path
import re
import unicodedata

import pandas as pd

from tyre_observations import normalize, persist
from tyre_shadow import connect
from tyre_analysis import dumps
from event_identity import resolve


def name(value):
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD',value).encode('ascii','ignore').decode().lower())


def import_cache(directory, persist_batches=False):
    directory=Path(directory);cache=directory/'openf1_cache'
    races=pd.read_parquet(directory/'races.parquet')[['season','round','gp_name','circuit','date']].drop_duplicates()
    observations=[];batches=[];skipped=[]
    for season in sorted(races.season.unique()):
        sp,mp=cache/f'sessions_year-{season}.json',cache/f'meetings_year-{season}.json'
        if not sp.exists() or not mp.exists():continue
        sessions=json.loads(sp.read_text());meetings=json.loads(mp.read_text())
        for race in races[races.season.eq(season)].sort_values('round').itertuples():
            try:
                meeting,provider_race=resolve(race._asdict(),meetings,sessions)
            except ValueError as error:
                skipped.append(dict(season=int(season),round=int(race.round),reason=str(error)))
                continue
            weekend=[s for s in sessions if s['meeting_key']==meeting['meeting_key']]
            boundary=provider_race['date_start']
            if pd.Timestamp(boundary)>pd.Timestamp.now(tz='UTC'):continue
            for session in weekend:
                if not session['session_name'].startswith('Practice') or session.get('is_cancelled'):continue
                paths={endpoint:cache/f'{endpoint}_session_key-{session["session_key"]}.json'
                       for endpoint in ['laps','stints','drivers','race_control']}
                if not all(p.exists() for p in paths.values()):continue
                payload={'sessions':[session],**{endpoint:json.loads(path.read_text()) for endpoint,path in paths.items()}}
                wx=cache/f'weather_session_key-{session["session_key"]}.json'
                payload['weather']=json.loads(wx.read_text()) if wx.exists() else []
                batch,rows=normalize(payload,int(season),int(race.round),boundary)
                if persist_batches:
                    with connect() as connection:persist(connection,batch,rows)
                observations.extend(rows);batches.append(dict(id=batch['id'],season=int(season),round=int(race.round),laps=len(rows)))
                print(f'Validated {season} R{race.round} {session["session_name"]}: {len(rows)} observed laps',flush=True)
    if not batches:raise ValueError('No original provider practice payloads available')
    return dict(kind='retrospectively_retrieved_observations',batches=batches,observations=observations,skipped=skipped,
                limitations=['Archive retrieval time is unknown; database retrieval time is the current import time.',
                             'Historical evaluations using this archive are reconstructions, not as-issued forecasts.'])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',required=True);parser.add_argument('--persist',action='store_true');parser.add_argument('--output',required=True)
    args=parser.parse_args();result=import_cache(args.data,args.persist)
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(dumps(result)+'\n')
    print(dumps(dict(batches=len(result['batches']),laps=len(result['observations']),output=str(path))))


if __name__=='__main__':main()
