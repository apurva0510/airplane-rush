import { env } from "cloudflare:workers";
import { COSMETICS, Profile, flightReward } from "./progression";
import type { GameState, Player } from "./game";
type StoredProfile = Omit<Profile, "owned"> & { id: string; owned: string };
export function gameDb() { if (!env.DB) throw new Error("Game storage is temporarily unavailable."); return env.DB; }
export async function getProfile(request: Request) {
  const id = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("ar-pass="))?.slice(8);
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) return null;
  return gameDb().prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first<StoredProfile>();
}
export function visibleProfile(profile: StoredProfile): Profile {
  const { id: _id, ...visible } = profile;
  void _id;
  return { ...visible, owned: JSON.parse(profile.owned) };
}
export function crewColor(profile: StoredProfile | null) { return profile ? COSMETICS.find(c => c.id === profile.equipped)?.color : undefined; }
export async function awardFlight(state: GameState, player: Player) {
  if (!player.profileId || state.phase !== "results" || !state.startedAt) return null;
  const reward = flightReward(player.served, state.result === "won", state.level);
  const results = await gameDb().batch([
    gameDb().prepare("INSERT OR IGNORE INTO rewards (profile_id, round_id, coins, score) VALUES (?, ?, ?, ?)").bind(player.profileId, `${state.code}:${state.startedAt}`, reward.coins, reward.score),
    gameDb().prepare("UPDATE profiles SET coins=coins+?, score=score+?, best=MAX(best,?), flights=flights+1, wins=wins+?, served=served+? WHERE id=? AND changes()=1").bind(reward.coins, reward.score, reward.score, state.result === "won" ? 1 : 0, player.served, player.profileId),
  ]);
  return { reward, alreadyClaimed: results[0].meta.changes === 0 };
}
export async function settleFlight(state: GameState) {
  if (state.phase === "results") await Promise.all(state.players.map(player => awardFlight(state, player)));
}
