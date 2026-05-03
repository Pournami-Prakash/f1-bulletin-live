// Static session times per round (ET strings)
// /Users/pournami/Documents/Projects/f1-bulletin/web/src/lib/f1-sessions.ts
// Snowflake owns dates/structure; this file owns display times only.
export const SESSION_TIMES: Record<number, {
    n: string
    et: string
    utcOffset: string // used to derive utc from race_date
  }[]> = {
    1: [
      { n: 'FP1',        et: 'THU 5 MAR · 8:30 PM ET',   utcOffset: '-2T01:30:00Z' },
      { n: 'FP2',        et: 'FRI 6 MAR · 12:00 AM ET',  utcOffset: '-2T05:00:00Z' },
      { n: 'QUALIFYING', et: 'SAT 7 MAR · 12:00 AM ET',  utcOffset: '-1T05:00:00Z' },
      { n: 'RACE',       et: 'SUN 8 MAR · 12:00 AM ET',  utcOffset: 'T05:00:00Z'   },
    ],
    2: [
      { n: 'FP1',        et: 'FRI 13 MAR · 10:30 PM ET', utcOffset: '-2T03:30:00Z' },
      { n: 'FP2',        et: 'SAT 14 MAR · 2:00 AM ET',  utcOffset: '-1T07:00:00Z' },
      { n: 'QUALIFYING', et: 'SAT 14 MAR · 3:00 AM ET',  utcOffset: '-1T08:00:00Z' },
      { n: 'RACE',       et: 'SUN 15 MAR · 3:00 AM ET',  utcOffset: 'T07:00:00Z'   },
    ],
    3: [
      { n: 'FP1',        et: 'THU 26 MAR · 11:30 PM ET', utcOffset: '-3T03:30:00Z' },
      { n: 'FP2',        et: 'FRI 27 MAR · 1:00 AM ET',  utcOffset: '-2T05:00:00Z' },
      { n: 'QUALIFYING', et: 'SAT 28 MAR · 1:00 AM ET',  utcOffset: '-1T05:00:00Z' },
      { n: 'RACE',       et: 'SUN 29 MAR · 1:00 AM ET',  utcOffset: 'T05:00:00Z'   },
    ],
    4: [
      { n: 'FP1',        et: 'FRI 2 MAY · 12:30 PM ET',  utcOffset: '-1T16:30:00Z' },
      { n: 'FP2',        et: 'FRI 2 MAY · 4:00 PM ET',   utcOffset: '-1T20:00:00Z' },
      { n: 'QUALIFYING', et: 'SAT 3 MAY · 12:00 PM ET',  utcOffset: 'T16:00:00Z'   },
      { n: 'RACE',       et: 'SUN 4 MAY · 3:00 PM ET',   utcOffset: 'T19:00:00Z'   },
    ],
    5: [
      { n: 'FP1',        et: 'FRI 23 MAY · 1:30 PM ET',  utcOffset: '-2T17:30:00Z' },
      { n: 'FP2',        et: 'FRI 23 MAY · 5:00 PM ET',  utcOffset: '-2T21:00:00Z' },
      { n: 'QUALIFYING', et: 'SAT 24 MAY · 10:00 AM ET', utcOffset: '-1T14:00:00Z' },
      { n: 'RACE',       et: 'SUN 25 MAY · 9:00 AM ET',  utcOffset: 'T13:00:00Z'   },
    ],
    // R6–R24: add as confirmed. Races shown with date only until filled in.
  }