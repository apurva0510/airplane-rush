import { gameDb, getProfile, visibleProfile, awardFlight } from "@/lib/profiles";
import { COSMETICS } from "@/lib/progression";
import { GameState } from "@/lib/game";
export const runtime = "edge";
export async function GET(request: Request) {
  try {
    const profile = await getProfile(request);
    const leaderboard = await gameDb().prepare("SELECT name, score, flights, wins, served FROM profiles WHERE flights > 0 ORDER BY score DESC, wins DESC LIMIT 20").all();
    const totals = await gameDb().prepare("SELECT COALESCE(SUM(flights),0) AS flights, COALESCE(SUM(served),0) AS served FROM profiles").first();
    return Response.json({ profile: profile ? visibleProfile(profile) : null, leaderboard: leaderboard.results, totals }, { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "Crew records are temporarily unavailable." }, { status: 503 }); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Use the game to update your crew pass." }, { status: 403 });
    const body = await request.json();
    let profile = await getProfile(request);
    if (body.action === "init" && !profile) {
      const id = crypto.randomUUID();
      await gameDb().prepare("INSERT INTO profiles (id) VALUES (?)").bind(id).run();
      return Response.json({ ready: true }, { headers: { "set-cookie": `ar-pass=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` } });
    }
    if (!profile) return Response.json({ error: "Create a crew pass first." }, { status: 401 });
    if (body.action === "claim") {
      const room = await gameDb().prepare("SELECT state, version FROM rooms WHERE code = ?").bind(String(body.code)).first<{ state: string; version: number }>();
      const state = room ? JSON.parse(room.state) as GameState : null;
      const player = state?.players.find(p => p.id === body.playerId && p.secret === body.secret && (!p.profileId || p.profileId === profile!.id));
      if (!state || state.phase !== "results" || !state.startedAt || !player) return Response.json({ error: "Finish your flight before collecting rewards." }, { status: 400 });
      if (!player.profileId) {
        player.profileId = profile.id;
        const attached = await gameDb().prepare("UPDATE rooms SET state=?, version=version+1 WHERE code=? AND version=?").bind(JSON.stringify(state), state.code, room!.version).run();
        if (!attached.meta.changes) return Response.json({ error: "The cabin changed. Please retry collecting rewards." }, { status: 409 });
        await gameDb().prepare("UPDATE profiles SET name=? WHERE id=?").bind(player.name, profile.id).run();
      }
      const awarded = await awardFlight(state, player);
      profile = (await getProfile(request))!;
      return Response.json({ profile: visibleProfile(profile), ...awarded });
    }
    if (body.action === "buy" || body.action === "equip") {
      const cosmetic = COSMETICS.find(c => c.id === body.item);
      if (!cosmetic) return Response.json({ error: "Choose a crew color." }, { status: 400 });
      const owned = JSON.parse(profile.owned) as string[];
      if (!owned.includes(cosmetic.id)) {
        if (body.action !== "buy" || profile.coins < cosmetic.cost) return Response.json({ error: "Earn more coins to unlock this color." }, { status: 400 });
        const result = await gameDb().prepare("UPDATE profiles SET coins=coins-?, owned=?, equipped=? WHERE id=? AND coins>=? AND owned=?").bind(cosmetic.cost, JSON.stringify([...owned, cosmetic.id]), cosmetic.id, profile.id, cosmetic.cost, profile.owned).run();
        if (!result.meta.changes) return Response.json({ error: "Your balance changed. Try again." }, { status: 409 });
      } else await gameDb().prepare("UPDATE profiles SET equipped=? WHERE id=?").bind(cosmetic.id, profile.id).run();
    } else if (body.action !== "init") return Response.json({ error: "Unknown crew pass action." }, { status: 400 });
    return Response.json({ profile: visibleProfile((await getProfile(request))!) });
  } catch { return Response.json({ error: "Could not update your crew pass. Please retry." }, { status: 503 }); }
}
