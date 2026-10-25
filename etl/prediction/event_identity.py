"""Resolve provider meetings by active status, name, race date and venue, never array index."""
import re
import unicodedata
import pandas as pd


def normalized(value):
    text=unicodedata.normalize('NFKD',str(value or '')).encode('ascii','ignore').decode().lower()
    return re.sub('[^a-z0-9]','',text).replace('barcelonacatalunyagrandprix','barcelonagrandprix')


def venue(value):
    key=normalized(value)
    return {'circuitdemonaco':'monaco','montecarlo':'monaco',
            'circuitdebarcelonacatalunya':'barcelona','catalunya':'barcelona',
            'redbullring':'spielberg','silverstonecircuit':'silverstone',
            'yasmarina':'yasisland','yasmarinacircuit':'yasisland',
            'singapore':'marinabay','madring':'madrid','montreal':'montreal',
            'sepanginternationalcircuit':'kualalumpur','circuitoftheamericas':'austin',
            'interlagos':'saopaulo','miami':'miamigardens','hungaroring':'budapest'}.get(key,key)


def resolve(race,meetings,sessions):
    name=race.get('gp_name',race.get('race_name'))
    date=race.get('race_start_utc',race.get('date'))
    location=race.get('city',race.get('circuit'))
    if not name or pd.isna(date) or not location:
        raise ValueError('Event identity requires name, date and venue')
    stamp=pd.Timestamp(date)
    stamp=stamp.tz_localize('UTC') if stamp.tzinfo is None else stamp.tz_convert('UTC')
    matches=[]
    for meeting in meetings:
        if meeting.get('is_cancelled') or normalized(meeting['meeting_name'])!=normalized(name):continue
        candidates=[s for s in sessions if s['meeting_key']==meeting['meeting_key']
                    and s['session_name']=='Race' and not s.get('is_cancelled')
                    and abs(pd.Timestamp(s['date_start'])-stamp)<pd.Timedelta(hours=36)
                    and venue(location) in {venue(s['location']),venue(s['circuit_short_name'])}]
        if len(candidates)==1:matches.append((meeting,candidates[0]))
    if len(matches)!=1:
        raise ValueError(f'Cannot uniquely verify event identity: {name}, {date}, {location}')
    return matches[0]


def audit(races,cache):
    """Fail closed on mismatches where provider caches exist; report unaudited years."""
    import json
    from pathlib import Path
    cache=Path(cache);checked=[];unavailable=[]
    for season,group in races.groupby('season'):
        sp,mp=cache/f'sessions_year-{season}.json',cache/f'meetings_year-{season}.json'
        if not sp.exists() or not mp.exists():
            unavailable.append(int(season));continue
        sessions=json.loads(sp.read_text());meetings=json.loads(mp.read_text())
        for row in group.to_dict('records'):
            meeting,session=resolve(row,meetings,sessions)
            checked.append(dict(season=int(season),round=int(row['round']),meeting_key=meeting['meeting_key'],
                                race_session_key=session['session_key'],location=session['location']))
    return dict(verified_events=checked,unaudited_years=unavailable,
                rule='active provider meeting + name + race date + venue; missing provider years explicitly unaudited')
