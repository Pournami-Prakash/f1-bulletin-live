-- ============================================================
-- F1 BULLETIN — 2026 RACE CALENDAR SEED
-- sql/race_calendar_seed.sql
--
-- Run ONCE to seed the 2026 F1 season calendar.
-- Re-run safely — uses MERGE so no duplicates.
-- Source: FIA / Formula1.com official 2026 calendar (current as of May 2026)
--
-- KEY CHANGES FROM ESTIMATED CALENDAR:
--   - 22-race official calendar
--   - Bahrain and Saudi Arabia REMOVED from the championship calendar
--   - Madrid ADDED as R14 (new street circuit debut)
--   - Sprint weekends corrected: China, Miami, Canada, GB, Netherlands, Singapore
--   - Miami is R4 and starts 17:00 UTC after weather-related start-time change
--   - Monaco Jun 5-7, Barcelona Jun 12-14
--   - Azerbaijan Sep 24-26 (Saturday race, Sep 26)
--   - Las Vegas Nov 19-21 (Saturday race, Nov 21)
-- ============================================================

USE DATABASE F1_BULLETIN;
USE SCHEMA MART;
USE WAREHOUSE COMPUTE_WH;

CREATE TABLE IF NOT EXISTS MART.RACE_CALENDAR (
  round               NUMBER        NOT NULL,
  race_name           VARCHAR       NOT NULL,
  circuit_name        VARCHAR       NOT NULL,
  city                VARCHAR,
  country             VARCHAR,
  country_code        CHAR(2),
  flag_emoji          TEXT,
  fp1_date            DATE,
  fp2_date            DATE,
  fp3_date            DATE,
  quali_date          DATE,
  sprint_quali_date   DATE,
  sprint_date         DATE,
  race_date           DATE NOT NULL,
  race_start_utc      TIMESTAMP_TZ,
  circuit_length_km   FLOAT,
  race_laps           NUMBER,
  lap_record          VARCHAR,
  lap_record_holder   VARCHAR,
  lap_record_year     NUMBER,
  drs_zones           NUMBER,
  is_sprint_weekend   BOOLEAN DEFAULT FALSE,
  is_completed        BOOLEAN DEFAULT FALSE,
  season              NUMBER DEFAULT 2026,
  created_at          TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at          TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (round, season)
);

MERGE INTO MART.RACE_CALENDAR tgt
USING (
  SELECT * FROM VALUES

  -- R1: Australia  Mar 6-8  (race Sun Mar 8)
  (1,'Australian Grand Prix','Albert Park Circuit','Melbourne','Australia','AU','🇦🇺',
   '2026-03-06'::DATE,'2026-03-06'::DATE,'2026-03-07'::DATE,'2026-03-07'::DATE,NULL,NULL,'2026-03-08'::DATE,
   '2026-03-08 05:00:00 +00:00'::TIMESTAMP_TZ,5.278,58,'1:20.235','Leclerc',2022,4,FALSE,TRUE,2026),

  -- R2: China  Mar 13-15  (race Sun Mar 15)  SPRINT
  (2,'Chinese Grand Prix','Shanghai International Circuit','Shanghai','China','CN','🇨🇳',
   '2026-03-13'::DATE,'2026-03-13'::DATE,NULL,'2026-03-14'::DATE,'2026-03-13'::DATE,'2026-03-14'::DATE,'2026-03-15'::DATE,
   '2026-03-15 07:00:00 +00:00'::TIMESTAMP_TZ,5.451,56,'1:24.108','Leclerc',2024,2,TRUE,TRUE,2026),

  -- R3: Japan  Mar 27-29  (race Sun Mar 29)
  (3,'Japanese Grand Prix','Suzuka International Racing Course','Suzuka','Japan','JP','🇯🇵',
   '2026-03-27'::DATE,'2026-03-27'::DATE,'2026-03-28'::DATE,'2026-03-28'::DATE,NULL,NULL,'2026-03-29'::DATE,
   '2026-03-29 05:00:00 +00:00'::TIMESTAMP_TZ,5.807,53,'1:30.983','Verstappen',2023,2,FALSE,FALSE,2026),

  -- R4: Miami  May 1-3  (race Sun May 3)  SPRINT
  (4,'Miami Grand Prix','Miami International Autodrome','Miami','United States','US','🇺🇸',
   '2026-05-01'::DATE,'2026-05-01'::DATE,NULL,'2026-05-02'::DATE,'2026-05-01'::DATE,'2026-05-02'::DATE,'2026-05-03'::DATE,
   '2026-05-03 17:00:00 +00:00'::TIMESTAMP_TZ,5.412,57,'1:29.708','Verstappen',2023,3,TRUE,FALSE,2026),

  -- R5: Canada  May 22-24  (race Sun May 24)  SPRINT
  (5,'Canadian Grand Prix','Circuit Gilles Villeneuve','Montreal','Canada','CA','🇨🇦',
   '2026-05-22'::DATE,'2026-05-22'::DATE,NULL,'2026-05-23'::DATE,'2026-05-22'::DATE,'2026-05-23'::DATE,'2026-05-24'::DATE,
   '2026-05-24 18:00:00 +00:00'::TIMESTAMP_TZ,4.361,70,'1:13.078','Bottas',2019,2,TRUE,FALSE,2026),

  -- R6: Monaco  Jun 5-7  (race Sun Jun 7)
  (6,'Monaco Grand Prix','Circuit de Monaco','Monte Carlo','Monaco','MC','🇲🇨',
   '2026-06-05'::DATE,'2026-06-05'::DATE,'2026-06-06'::DATE,'2026-06-06'::DATE,NULL,NULL,'2026-06-07'::DATE,
   '2026-06-07 13:00:00 +00:00'::TIMESTAMP_TZ,3.337,78,'1:12.909','Leclerc',2024,0,FALSE,FALSE,2026),

  -- R7: Barcelona-Catalunya  Jun 12-14  (race Sun Jun 14)
  (7,'Barcelona-Catalunya Grand Prix','Circuit de Barcelona-Catalunya','Barcelona','Spain','ES','🇪🇸',
   '2026-06-12'::DATE,'2026-06-12'::DATE,'2026-06-13'::DATE,'2026-06-13'::DATE,NULL,NULL,'2026-06-14'::DATE,
   '2026-06-14 13:00:00 +00:00'::TIMESTAMP_TZ,4.657,66,'1:16.330','Verstappen',2023,2,FALSE,FALSE,2026),

  -- R8: Austria  Jun 26-28  (race Sun Jun 28)
  (8,'Austrian Grand Prix','Red Bull Ring','Spielberg','Austria','AT','🇦🇹',
   '2026-06-26'::DATE,'2026-06-26'::DATE,'2026-06-27'::DATE,'2026-06-27'::DATE,NULL,NULL,'2026-06-28'::DATE,
   '2026-06-28 13:00:00 +00:00'::TIMESTAMP_TZ,4.318,71,'1:05.619','Leclerc',2020,3,FALSE,FALSE,2026),

  -- R9: Great Britain  Jul 3-5  (race Sun Jul 5)  SPRINT
  (9,'British Grand Prix','Silverstone Circuit','Silverstone','United Kingdom','GB','🇬🇧',
   '2026-07-03'::DATE,'2026-07-03'::DATE,NULL,'2026-07-04'::DATE,'2026-07-03'::DATE,'2026-07-04'::DATE,'2026-07-05'::DATE,
   '2026-07-05 14:00:00 +00:00'::TIMESTAMP_TZ,5.891,52,'1:27.097','Hamilton',2020,2,TRUE,FALSE,2026),

  -- R10: Belgium  Jul 17-19  (race Sun Jul 19)
  (10,'Belgian Grand Prix','Circuit de Spa-Francorchamps','Spa','Belgium','BE','🇧🇪',
   '2026-07-17'::DATE,'2026-07-17'::DATE,'2026-07-18'::DATE,'2026-07-18'::DATE,NULL,NULL,'2026-07-19'::DATE,
   '2026-07-19 13:00:00 +00:00'::TIMESTAMP_TZ,7.004,44,'1:46.286','Bottas',2018,2,FALSE,FALSE,2026),

  -- R11: Hungary  Jul 24-26  (race Sun Jul 26)
  (11,'Hungarian Grand Prix','Hungaroring','Budapest','Hungary','HU','🇭🇺',
   '2026-07-24'::DATE,'2026-07-24'::DATE,'2026-07-25'::DATE,'2026-07-25'::DATE,NULL,NULL,'2026-07-26'::DATE,
   '2026-07-26 13:00:00 +00:00'::TIMESTAMP_TZ,4.381,70,'1:16.627','Hamilton',2020,1,FALSE,FALSE,2026),

  -- R12: Netherlands  Aug 21-23  (race Sun Aug 23)  SPRINT — final Dutch GP
  (12,'Dutch Grand Prix','Circuit Zandvoort','Zandvoort','Netherlands','NL','🇳🇱',
   '2026-08-21'::DATE,'2026-08-21'::DATE,NULL,'2026-08-22'::DATE,'2026-08-21'::DATE,'2026-08-22'::DATE,'2026-08-23'::DATE,
   '2026-08-23 13:00:00 +00:00'::TIMESTAMP_TZ,4.259,72,'1:11.097','Verstappen',2021,2,TRUE,FALSE,2026),

  -- R13: Italy (Monza)  Sep 4-6  (race Sun Sep 6)
  (13,'Italian Grand Prix','Autodromo Nazionale Monza','Monza','Italy','IT','🇮🇹',
   '2026-09-04'::DATE,'2026-09-04'::DATE,'2026-09-05'::DATE,'2026-09-05'::DATE,NULL,NULL,'2026-09-06'::DATE,
   '2026-09-06 13:00:00 +00:00'::TIMESTAMP_TZ,5.793,53,'1:21.046','Barrichello',2004,2,FALSE,FALSE,2026),

  -- R14: Spain (Madrid)  Sep 11-13  (race Sun Sep 13)  NEW VENUE
  (14,'Spanish Grand Prix','Madrid Street Circuit','Madrid','Spain','ES','🇪🇸',
   '2026-09-11'::DATE,'2026-09-11'::DATE,'2026-09-12'::DATE,'2026-09-12'::DATE,NULL,NULL,'2026-09-13'::DATE,
   '2026-09-13 13:00:00 +00:00'::TIMESTAMP_TZ,5.500,55,NULL,NULL,NULL,2,FALSE,FALSE,2026),

  -- R15: Azerbaijan  Sep 24-26  (race SAT Sep 26 — Saturday race)
  (15,'Azerbaijan Grand Prix','Baku City Circuit','Baku','Azerbaijan','AZ','🇦🇿',
   '2026-09-24'::DATE,'2026-09-24'::DATE,'2026-09-25'::DATE,'2026-09-25'::DATE,NULL,NULL,'2026-09-26'::DATE,
   '2026-09-26 11:00:00 +00:00'::TIMESTAMP_TZ,6.003,51,'1:43.009','Leclerc',2019,2,FALSE,FALSE,2026),

  -- R16: Singapore  Oct 9-11  (race Sun Oct 11)  SPRINT
  (16,'Singapore Grand Prix','Marina Bay Street Circuit','Singapore','Singapore','SG','🇸🇬',
   '2026-10-09'::DATE,'2026-10-09'::DATE,NULL,'2026-10-10'::DATE,'2026-10-09'::DATE,'2026-10-10'::DATE,'2026-10-11'::DATE,
   '2026-10-11 12:00:00 +00:00'::TIMESTAMP_TZ,4.940,62,'1:35.867','Leclerc',2023,3,TRUE,FALSE,2026),

  -- R17: United States  Oct 23-25  (race Sun Oct 25)
  (17,'United States Grand Prix','Circuit of The Americas','Austin','United States','US','🇺🇸',
   '2026-10-23'::DATE,'2026-10-23'::DATE,'2026-10-24'::DATE,'2026-10-24'::DATE,NULL,NULL,'2026-10-25'::DATE,
   '2026-10-25 19:00:00 +00:00'::TIMESTAMP_TZ,5.513,56,'1:36.169','Leclerc',2019,2,FALSE,FALSE,2026),

  -- R18: Mexico  Oct 30-Nov 1  (race Sun Nov 1)
  (18,'Mexico City Grand Prix','Autodromo Hermanos Rodriguez','Mexico City','Mexico','MX','🇲🇽',
   '2026-10-30'::DATE,'2026-10-30'::DATE,'2026-10-31'::DATE,'2026-10-31'::DATE,NULL,NULL,'2026-11-01'::DATE,
   '2026-11-01 20:00:00 +00:00'::TIMESTAMP_TZ,4.304,71,'1:17.774','Bottas',2021,2,FALSE,FALSE,2026),

  -- R19: Brazil  Nov 6-8  (race Sun Nov 8)
  (19,'São Paulo Grand Prix','Autodromo Jose Carlos Pace','São Paulo','Brazil','BR','🇧🇷',
   '2026-11-06'::DATE,'2026-11-06'::DATE,'2026-11-07'::DATE,'2026-11-07'::DATE,NULL,NULL,'2026-11-08'::DATE,
   '2026-11-08 17:00:00 +00:00'::TIMESTAMP_TZ,4.309,71,'1:10.540','Russell',2023,2,FALSE,FALSE,2026),

  -- R20: Las Vegas  Nov 19-21  (race SAT Nov 21 — Saturday race)
  (20,'Las Vegas Grand Prix','Las Vegas Strip Circuit','Las Vegas','United States','US','🇺🇸',
   '2026-11-19'::DATE,'2026-11-19'::DATE,'2026-11-20'::DATE,'2026-11-20'::DATE,NULL,NULL,'2026-11-21'::DATE,
   '2026-11-21 06:00:00 +00:00'::TIMESTAMP_TZ,6.201,50,'1:35.119','Leclerc',2023,2,FALSE,FALSE,2026),

  -- R21: Qatar  Nov 27-29  (race Sun Nov 29)
  (21,'Qatar Grand Prix','Lusail International Circuit','Lusail','Qatar','QA','🇶🇦',
   '2026-11-27'::DATE,'2026-11-27'::DATE,'2026-11-28'::DATE,'2026-11-28'::DATE,NULL,NULL,'2026-11-29'::DATE,
   '2026-11-29 14:00:00 +00:00'::TIMESTAMP_TZ,5.380,57,'1:24.319','Piastri',2023,3,FALSE,FALSE,2026),

  -- R22: Abu Dhabi  Dec 4-6  (race Sun Dec 6)
  (22,'Abu Dhabi Grand Prix','Yas Marina Circuit','Abu Dhabi','United Arab Emirates','AE','🇦🇪',
   '2026-12-04'::DATE,'2026-12-04'::DATE,'2026-12-05'::DATE,'2026-12-05'::DATE,NULL,NULL,'2026-12-06'::DATE,
   '2026-12-06 13:00:00 +00:00'::TIMESTAMP_TZ,5.281,58,'1:26.103','Leclerc',2023,2,FALSE,FALSE,2026)

) AS src(
  round,race_name,circuit_name,city,country,country_code,flag_emoji,
  fp1_date,fp2_date,fp3_date,quali_date,sprint_quali_date,sprint_date,race_date,race_start_utc,
  circuit_length_km,race_laps,lap_record,lap_record_holder,lap_record_year,
  drs_zones,is_sprint_weekend,is_completed,season
)
ON tgt.round = src.round AND tgt.season = src.season
WHEN MATCHED THEN UPDATE SET
  race_name=src.race_name,circuit_name=src.circuit_name,city=src.city,country=src.country,
  country_code=src.country_code,flag_emoji=src.flag_emoji,
  fp1_date=src.fp1_date,fp2_date=src.fp2_date,fp3_date=src.fp3_date,quali_date=src.quali_date,
  sprint_quali_date=src.sprint_quali_date,sprint_date=src.sprint_date,
  race_date=src.race_date,race_start_utc=src.race_start_utc,
  circuit_length_km=src.circuit_length_km,race_laps=src.race_laps,
  lap_record=src.lap_record,lap_record_holder=src.lap_record_holder,
  lap_record_year=src.lap_record_year,drs_zones=src.drs_zones,
  is_sprint_weekend=src.is_sprint_weekend,updated_at=CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  round,race_name,circuit_name,city,country,country_code,flag_emoji,
  fp1_date,fp2_date,fp3_date,quali_date,sprint_quali_date,sprint_date,race_date,race_start_utc,
  circuit_length_km,race_laps,lap_record,lap_record_holder,lap_record_year,
  drs_zones,is_sprint_weekend,is_completed,season
) VALUES (
  src.round,src.race_name,src.circuit_name,src.city,src.country,src.country_code,src.flag_emoji,
  src.fp1_date,src.fp2_date,src.fp3_date,src.quali_date,src.sprint_quali_date,src.sprint_date,
  src.race_date,src.race_start_utc,src.circuit_length_km,src.race_laps,src.lap_record,
  src.lap_record_holder,src.lap_record_year,src.drs_zones,src.is_sprint_weekend,src.is_completed,src.season
);

DELETE FROM MART.RACE_CALENDAR WHERE season=2026 AND round > 22;

UPDATE MART.RACE_CALENDAR SET is_completed=TRUE WHERE race_date < CURRENT_DATE() AND season=2026;

SELECT round,flag_emoji,race_name,race_date,is_sprint_weekend,
       DATEDIFF('day',CURRENT_DATE(),race_date) AS days_away
FROM MART.RACE_CALENDAR WHERE season=2026 ORDER BY round;
