"use client";
import { useCallback, useEffect, useState } from "react";
import { Coins, Trophy, Award, X, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COSMETICS, Profile, Ranking, flightReward } from "@/lib/progression";
import { PublicGameState } from "@/lib/game";
type PassIdentity = { code: string; playerId: string; secret: string };
let passportInitialization: Promise<void> | null = null;
export function ensureCrewPassport() {
  if (!passportInitialization) passportInitialization = fetch("/api/progression", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "init" }) }).then(async response => {
    if (!response.ok) throw new Error((await response.json()).error);
  }).catch(error => { passportInitialization = null; throw error; });
  return passportInitialization;
}
export function CrewPass({ state, identity }: { state: PublicGameState | null; identity: PassIdentity | null }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [totals, setTotals] = useState({ flights: 0, served: 0 });
  const [view, setView] = useState<"shop" | "scores" | "goals" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<{ coins: number; score: number; round: number | null } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/progression", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setProfile(data.profile); setRankings(data.leaderboard); setTotals(data.totals);
  }, []);
  const update = useCallback(async (payload: object) => {
    const response = await fetch("/api/progression", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }, []);
  useEffect(() => {
    let active = true;
    ensureCrewPassport().then(() => { if (active) return load(); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [load, update]);
  useEffect(() => {
    if (state?.phase !== "results" || !state.startedAt || !identity) return;
    let active = true;
    ensureCrewPassport().then(() => update({ action: "claim", ...identity })).then(data => { if (active) { setError(""); setProfile(data.profile); setReward({ ...data.reward, round: state.startedAt }); void load().catch(e => setError(e.message)); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [state?.phase, state?.startedAt, identity, update, load]);
  const shop = async (item: string, owned: boolean) => {
    setBusy(true); setError("");
    try { const data = await update({ action: owned ? "equip" : "buy", item }); setProfile(data.profile); }
    catch (e) { setError(e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  };
  const open = (next: typeof view) => { setView(view === next ? null : next); void load().catch(e => setError(e.message)); };
  const goals = [
    { name: "First landing", value: profile?.flights ?? 0, goal: 1, detail: "Finish your first flight" },
    { name: "Cabin favorite", value: profile?.served ?? 0, goal: 25, detail: "Serve 25 passengers" },
    { name: "Reliable crew", value: profile?.wins ?? 0, goal: 5, detail: "Clear 5 flights" },
    { name: "Frequent flyer", value: profile?.flights ?? 0, goal: 10, detail: "Finish 10 flights" },
  ];
  const mine = state?.players.find(p => p.id === identity?.playerId);
  const expected = state && mine ? flightReward(mine.served, state.result === "won", state.level) : null;
  const currentReward = reward?.round === state?.startedAt ? reward : expected;
  return <section className="crew-pass" aria-label="Crew progression"><div className="pass-toolbar"><span className="pass-label">CREW PASSPORT</span><Button variant="ghost" onClick={() => open("shop")}><Coins size={18} />{profile?.coins ?? "—"} coins</Button><Button variant="ghost" onClick={() => open("scores")}><Trophy size={18} />Global scores</Button><Button variant="ghost" onClick={() => open("goals")}><Award size={18} />Milestones</Button></div>
    {state?.phase === "results" && !!state.startedAt && <p className="reward-banner"><Coins size={18} />Flight rewards: +{currentReward?.coins ?? 0} coins · +{currentReward?.score ?? 0} score{error ? " · Collection needs retry" : ""}</p>}
    {view && <div className="pass-panel"><header><div><p className="eyebrow">Your next destination</p><h2>{view === "shop" ? "Crew wardrobe" : view === "scores" ? "Global departures board" : "Earn your wings"}</h2></div><Button variant="ghost" aria-label="Close crew passport" onClick={() => setView(null)}><X /></Button></header>
      {view === "shop" && <><p>Earn 5 coins per delivery, 10 per completed flight, and 20 extra for clearing the level. Colors are cosmetic only.</p><div className="cosmetic-grid">{COSMETICS.map(c => { const owned = profile?.owned.includes(c.id) ?? false; return <article key={c.id}><span className="cosmetic-sprite" style={{ background: c.color }}><UserRound size={28} /></span><h3>{c.name}</h3><Button disabled={!profile || busy || profile.equipped === c.id || (!owned && profile.coins < c.cost)} onClick={() => shop(c.id, owned)}>{profile?.equipped === c.id ? "Equipped" : owned ? "Equip" : `${c.cost} coins`}</Button></article>; })}</div><small>Equipped colors appear when you join your next room.</small></>}
      {view === "scores" && <><div className="pass-stats"><span><strong>{totals.flights}</strong> completed crew flights</span><span><strong>{totals.served}</strong> passengers served worldwide</span><span><strong>{profile?.score ?? 0}</strong> your lifetime score</span></div><p>100 points per delivery · 500 for a clear · 50 per level completed. Names are public; scores come from completed flights.</p>{rankings.length ? <ol className="ranking-list">{rankings.map((r, i) => <li key={i}><span className="rank">{i + 1}</span><span><strong>{r.name}</strong><small>{r.flights} flights · {r.served} served · {r.wins} clears</small></span><b>{r.score.toLocaleString()}</b></li>)}</ol> : <p className="empty-board">The runway is yours. Finish a flight to set the first score.</p>}</>}
      {view === "goals" && <><div className="pass-stats"><span><strong>{profile?.flights ?? 0}</strong> flights</span><span><strong>{profile?.served ?? 0}</strong> deliveries</span><span><strong>{profile?.best ?? 0}</strong> best flight score</span></div><div className="milestone-grid">{goals.map(g => <article key={g.name} className={g.value >= g.goal ? "unlocked" : ""}><Award /><h3>{g.name}</h3><p>{g.detail}</p><strong>{g.value >= g.goal ? "Earned" : `${g.value} / ${g.goal}`}</strong></article>)}</div></>}
      <p className="pass-footnote">Progress is saved online for this browser’s crew pass. Clearing browser cookies or switching devices starts a new pass. No purchases or gameplay advantages.</p>
    </div>}{error && <p className="pass-error" role="alert">{error} <Button variant="ghost" onClick={() => { setError(""); void update(state?.phase === "results" && identity ? { action: "claim", ...identity } : { action: "init" }).then(load).catch(e => setError(e.message)); }}>Retry</Button></p>}</section>;
}
