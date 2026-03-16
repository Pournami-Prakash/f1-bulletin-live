// app/api/standings/route.ts
import { NextRequest, NextResponse } from "next/server";

const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const season = searchParams.get("season") ?? "current";
  const type = searchParams.get("type") ?? "drivers"; // "drivers" | "constructors"

  try {
    const endpoint =
      type === "constructors"
        ? `${JOLPICA_BASE}/${season}/constructorStandings.json`
        : `${JOLPICA_BASE}/${season}/driverStandings.json`;

    const res = await fetch(endpoint, {
      next: { revalidate: 3600 }, // cache for 1 hour
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch standings" },
        { status: res.status }
      );
    }

    const data = await res.json();
    const lists = data?.MRData?.StandingsTable?.StandingsLists ?? [];

    if (lists.length === 0) {
      return NextResponse.json({ standings: [], season });
    }

    const standings =
      type === "constructors"
        ? lists[0].ConstructorStandings
        : lists[0].DriverStandings;

    return NextResponse.json({ standings, season: lists[0].season });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}