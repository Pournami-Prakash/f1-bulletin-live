import { NextRequest, NextResponse } from "next/server";
import { fetchJolpicaJson, parseStandingType, standingsPath } from "@/lib/jolpica";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const season = searchParams.get("season") ?? "current";
  const type = parseStandingType(searchParams.get("type"));

  try {
    const data = await fetchJolpicaJson(standingsPath(season, type));
    const lists = data?.MRData?.StandingsTable?.StandingsLists ?? [];

    if (lists.length === 0) {
      return NextResponse.json({ standings: [], season });
    }

    const standings =
      type === "constructors"
        ? lists[0].ConstructorStandings
        : lists[0].DriverStandings;

    return NextResponse.json({ standings, season: lists[0].season });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
