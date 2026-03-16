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
      { n: 'FP1',        et: 'FRI 10 APR · 9:30 AM ET',  utcOffset: '-2T13:30:00Z' },
      { n: 'FP2',        et: 'FRI 10 APR · 1:00 PM ET',  utcOffset: '-2T17:00:00Z' },
      { n: 'QUALIFYING', et: 'SAT 11 APR · 12:00 PM ET', utcOffset: '-1T16:00:00Z' },
      { n: 'RACE',       et: 'SUN 12 APR · 11:00 AM ET', utcOffset: 'T15:00:00Z'   },
    ],
    5: [
      { n: 'FP1',        et: 'FRI 17 APR · 11:30 AM ET', utcOffset: '-2T15:30:00Z' },
      { n: 'FP2',        et: 'FRI 17 APR · 3:00 PM ET',  utcOffset: '-2T19:00:00Z' },
      { n: 'QUALIFYING', et: 'SAT 18 APR · 2:00 PM ET',  utcOffset: '-1T18:00:00Z' },
      { n: 'RACE',       et: 'SUN 19 APR · 1:00 PM ET',  utcOffset: 'T17:00:00Z'   },
    ],
    // R6–R24: add as confirmed. Races shown with date only until filled in.
  }