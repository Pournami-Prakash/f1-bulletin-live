import { err, ok, toErrorMessage, unauthorized, validateIngestAuth } from "@/lib/api";
import { refreshNeonIntelligence } from "@/lib/neon-intelligence-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!validateIngestAuth(req)) return unauthorized();

  try {
    const result = await refreshNeonIntelligence();
    return ok({
      storage: "neon",
      model: "neon-heuristic-v1",
      ...result,
    });
  } catch (e) {
    console.error("[/api/intelligence/refresh]", e);
    return err(toErrorMessage(e));
  }
}
