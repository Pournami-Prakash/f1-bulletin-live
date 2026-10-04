"""Reconcile race classification against Formula 1's published results.

Timing feeds remain the source for laps; the official classification determines
finishing positions and championship points. No forecast probabilities are changed.
"""
from html.parser import HTMLParser
import re
from urllib.request import Request, urlopen

ROOT = "https://www.formula1.com"
SLUGS = {
    "Australian": "australia", "Chinese": "china", "Japanese": "japan",
    "Miami": "miami", "Canadian": "canada", "Monaco": "monaco",
    "Barcelona": "barcelona-catalunya", "Barcelona-Catalunya": "barcelona-catalunya",
    "Austrian": "austria", "British": "great-britain", "Belgian": "belgium",
    "Hungarian": "hungary", "Dutch": "netherlands", "Italian": "italy",
    "Spanish": "spain", "Azerbaijan": "azerbaijan", "Bahrain": "bahrain",
    "Singapore": "singapore", "United States": "united-states",
    "Mexico City": "mexico", "São Paulo": "brazil", "Las Vegas": "las-vegas",
    "Qatar": "qatar", "Abu Dhabi": "abu-dhabi",
}

TEAM_ALIASES = {"Red Bull": "Red Bull Racing", "RB F1 Team": "Racing Bulls",
                "Alpine F1 Team": "Alpine", "Cadillac F1 Team": "Cadillac"}


def normalize_teams(connection):
    with connection.cursor() as cursor:
        for old, new in TEAM_ALIASES.items():
            for table in ("results", "predictions"):
                cursor.execute(f"UPDATE {table} SET team=%s WHERE team=%s", (new, old))
    connection.commit()


class ResultsHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.links.append(dict(attrs).get("href", ""))
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": "F1Bulletin/1.0"}), timeout=45) as response:
        page = ResultsHTML()
        page.feed(response.read().decode())
    return page


def result_urls(season):
    page = fetch(f"{ROOT}/en/results/{season}/races")
    urls = {}
    for link in page.links:
        match = re.search(rf"/en/results/{season}/races/\d+/([^/]+)/race-result$", link)
        if match:
            urls[match[1]] = ROOT + link if link.startswith("/") else link
    if not urls:
        raise RuntimeError("Formula 1 results navigation is unavailable")
    return urls


def classification(url):
    rows = []
    for cells in fetch(url).rows:
        if len(cells) != 7 or not (cells[0].isdigit() or cells[0] in {"NC", "DQ", "DSQ"}):
            continue
        driver = re.search(r"([A-Z]{3})$", cells[2])
        if not driver:
            raise RuntimeError(f"Cannot identify driver in official classification: {cells[2]}")
        position = int(cells[0]) if cells[0].isdigit() else len(rows) + 1
        status = "Retired" if cells[5] == "DNF" else "Lapped" if "lap" in cells[5].lower() else "Finished"
        if cells[0] in {"DQ", "DSQ"}:
            status = "Disqualified"
        rows.append((driver[1], position, float(cells[6]), status))
    if len(rows) < 15 or len({r[0] for r in rows}) != len(rows) or sum(r[1] == 1 for r in rows) != 1:
        raise RuntimeError(f"Incomplete official classification at {url}")
    return rows


def reconcile(connection, season, round_number, event_name, urls):
    name = event_name.removesuffix(" Grand Prix")
    slug = SLUGS.get(name)
    if not slug or slug not in urls:
        raise RuntimeError(f"No official classification URL for {event_name}")
    url = urls[slug]
    rows = classification(url)
    with connection.cursor() as cursor:
        cursor.execute("""SELECT r.driver_code FROM results r JOIN sessions s ON s.id=r.session_id
                          WHERE s.season=%s AND s.round=%s AND s.session_type='R'""", (season, round_number))
        drivers = {r[0] for r in cursor.fetchall()}
        if drivers != {r[0] for r in rows}:
            raise RuntimeError(f"Official and imported entry lists differ for R{round_number}; manual review required")
        for driver, position, points, status in rows:
            cursor.execute("""UPDATE results r SET finish_position=%s, points=%s, status=%s
                              FROM sessions s WHERE s.id=r.session_id AND s.season=%s
                              AND s.round=%s AND s.session_type='R' AND r.driver_code=%s""",
                           (position, points, status, season, round_number, driver))
    connection.commit()
    normalize_teams(connection)
    print(f"Official classification verified: R{round_number}, {len(rows)} drivers, {url}", flush=True)
    return rows
