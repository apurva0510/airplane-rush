"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Armchair, Check, Clock3, Coffee, Copy, Crown, Droplets, Keyboard, Package, Plane, Sandwich, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Item, ITEMS, PassengerRequest, PublicGameState } from "@/lib/game";

type Identity = { code: string; playerId: string; secret: string };
type WebTool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: Record<string, unknown>) => Promise<unknown> };
type ModelContext = { registerTool: (tool: WebTool, options?: { signal?: AbortSignal }) => void | Promise<void> };
const ITEM_LABELS: Record<Item, string> = { water: "Water", coffee: "Coffee", snack: "Snack", blanket: "Blanket" };
const ITEM_ICONS = { water: Droplets, coffee: Coffee, snack: Sandwich, blanket: Package };

async function request(payload: Record<string, unknown>) {
  const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json() as { state?: PublicGameState; playerId?: string; secret?: string; error?: string };
  if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export function GameClient() {
  const [state, setState] = useState<PublicGameState | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(0);
  const stateRef = useRef(state);
  const identityRef = useRef(identity);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { identityRef.current = identity; }, [identity]);

  useEffect(() => {
    const saved = localStorage.getItem("airplane-rush-identity");
    if (saved) window.setTimeout(() => setIdentity(JSON.parse(saved)), 0);
  }, []);

  const refresh = useCallback(async (active: Identity) => {
    const response = await fetch(`/api/rooms?code=${encodeURIComponent(active.code)}`, { cache: "no-store" });
    const data = await response.json() as { state?: PublicGameState; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not reach the cabin.");
    setState(data.state!);
  }, []);

  useEffect(() => {
    if (!identity) return;
    const initial = window.setTimeout(() => refresh(identity).catch((reason) => setError(reason.message)), 0);
    const poll = window.setInterval(() => refresh(identity).catch(() => undefined), 900);
    return () => { window.clearTimeout(initial); window.clearInterval(poll); };
  }, [identity, refresh]);

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  const enter = async (operation: "create" | "join") => {
    setBusy(true); setError("");
    try {
      const data = await request({ operation, name, code: joinCode.toUpperCase() });
      const nextIdentity = { code: data.state!.code, playerId: data.playerId!, secret: data.secret! };
      localStorage.setItem("airplane-rush-identity", JSON.stringify(nextIdentity));
      setIdentity(nextIdentity); setState(data.state!);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not join."); }
    finally { setBusy(false); }
  };

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!identity) return;
    setBusy(true); setError("");
    try {
      const data = await request({ operation: "action", action, ...identity, ...extra });
      setState(data.state!);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Action failed."); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebTool) => { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined); };
    register({
      name: "get_cabin_status", title: "Get cabin status",
      description: "Read the visible Airplane Rush room, phase, players, score, timer, requests, and your inventory.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async () => {
        const currentState = stateRef.current;
        const currentIdentity = identityRef.current;
        return currentState ? { code: currentState.code, phase: currentState.phase, players: currentState.players.map((player) => ({ name: player.name, row: player.row, served: player.served })), satisfaction: currentState.satisfaction, target: currentState.target, requests: currentState.requests.map(({ id, seat, item, expiresAt }) => ({ id, seat, item, expiresAt })), inventory: currentState.players.find((player) => player.id === currentIdentity?.playerId)?.inventory ?? [] } : { phase: "home" };
      },
    });
    register({
      name: "perform_cabin_action", title: "Perform cabin action",
      description: "In an active Airplane Rush room, start or reset a round, move one row, take a galley item, or serve a passenger request. This changes the shared game for every player.",
      inputSchema: { type: "object", properties: { action: { type: "string", enum: ["start", "rematch", "move", "take", "serve"] }, row: { type: "integer", minimum: 0, maximum: 6 }, item: { type: "string", enum: [...ITEMS] }, requestId: { type: "string" } }, required: ["action"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input) => {
        const currentIdentity = identityRef.current;
        if (!currentIdentity) throw new Error("Join a flight in the visible interface first.");
        const allowed = ["start", "rematch", "move", "take", "serve"];
        const action = String(input.action ?? "");
        if (!allowed.includes(action)) throw new Error("Choose a supported cabin action.");
        const data = await request({ operation: "action", ...currentIdentity, action, row: input.row, item: input.item, requestId: input.requestId });
        setState(data.state!);
        stateRef.current = data.state!;
        return { phase: data.state!.phase, satisfaction: data.state!.satisfaction, row: data.state!.players.find((player) => player.id === currentIdentity.playerId)?.row };
      },
    });
    return () => lifecycle.abort();
  }, []);

  const leave = () => {
    localStorage.removeItem("airplane-rush-identity");
    setIdentity(null); setState(null); setError("");
  };

  if (!state || !identity) return <Welcome name={name} setName={setName} joinCode={joinCode} setJoinCode={setJoinCode} busy={busy} error={error} onEnter={enter} />;
  const me = state.players.find((player) => player.id === identity.playerId);
  if (!me) return <Welcome name={name} setName={setName} joinCode={joinCode} setJoinCode={setJoinCode} busy={busy} error="This crew pass is no longer in the room." onEnter={enter} />;

  const copyCode = async () => {
    await navigator.clipboard.writeText(state.code);
    setCopied(true); window.setTimeout(() => setCopied(false), 1500);
  };

  if (state.phase === "lobby") return <Lobby state={state} meId={me.id} busy={busy} error={error} copied={copied} onCopy={copyCode} onStart={() => act("start")} onLeave={leave} />;
  if (state.phase === "results") return <Results state={state} meId={me.id} busy={busy} error={error} onRematch={() => act("rematch")} onLeave={leave} />;
  return <Flight state={state} meId={me.id} now={now} busy={busy} error={error} onAction={act} />;
}

function Brand() { return <div className="brand"><span className="brand-mark"><Plane size={20} /></span><span>Airplane Rush</span></div>; }

function Welcome({ name, setName, joinCode, setJoinCode, busy, error, onEnter }: { name: string; setName: (value: string) => void; joinCode: string; setJoinCode: (value: string) => void; busy: boolean; error: string; onEnter: (operation: "create" | "join") => void }) {
  return <main className="welcome-shell"><div className="cloud cloud-one" /><div className="cloud cloud-two" /><section className="welcome-card"><Brand /><div className="welcome-copy"><p className="eyebrow">Co-op cabin crew · 2–6 players</p><h1>Good service.<br /><em>Very</em> little time.</h1><p>Grab supplies, race your crew member down the aisle, and keep every passenger happy before landing.</p></div><div className="entry-panel"><label htmlFor="crew-name">Your crew name</label><Input id="crew-name" value={name} maxLength={18} onChange={(event) => setName(event.target.value)} placeholder="e.g. Captain Casey" /><Button className="primary-action" disabled={busy || !name.trim()} onClick={() => onEnter("create")}>Create a flight</Button><div className="or"><span />or join a crew<span /></div><div className="join-row"><Input aria-label="Room code" value={joinCode} maxLength={5} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="CODE" /><Button variant="outline" disabled={busy || !name.trim() || joinCode.length !== 5} onClick={() => onEnter("join")}>Join</Button></div>{error && <p className="error" role="alert">{error}</p>}</div><div className="rules-strip"><span><b>1</b> Collect supplies</span><span><b>2</b> Move with W/S or arrows</span><span><b>3</b> Serve before patience runs out</span></div></section></main>;
}

function Lobby({ state, meId, busy, error, copied, onCopy, onStart, onLeave }: { state: PublicGameState; meId: string; busy: boolean; error: string; copied: boolean; onCopy: () => void; onStart: () => void; onLeave: () => void }) {
  const isHost = state.hostId === meId;
  return <main className="screen-shell"><header className="topbar"><Brand /><Button variant="ghost" onClick={onLeave}>Leave room</Button></header><section className="lobby-card"><div className="lobby-heading"><p className="eyebrow">Flight AR-{state.code}</p><h1>Assemble your cabin crew</h1><p>Share this code. Everyone joins from their own phone or laptop.</p></div><button className="room-code" onClick={onCopy}><span>{state.code}</span>{copied ? <Check /> : <Copy />}</button><div className="crew-list">{state.players.map((player) => <div className="crew-member" key={player.id}><span className="player-dot" style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</span><span>{player.name}</span>{player.id === state.hostId && <span className="captain"><Crown size={14} /> Captain</span>}</div>)}{Array.from({ length: Math.max(0, 2 - state.players.length) }).map((_, index) => <div className="crew-member waiting" key={index}><span className="player-dot">?</span><span>Waiting for crew…</span></div>)}</div><div className="briefing"><h2>Cabin briefing</h2><div><span><Droplets />Pick up to 2 supplies in the galley.</span><span><Keyboard />Move your sprite with W/S or arrow keys. Phones use touch controls.</span><span><Clock3 />Finish the full 3-minute flight with {state.target}% satisfaction to clear level {state.level}.</span></div></div>{isHost ? <Button className="primary-action" disabled={busy || state.players.length < 2} onClick={onStart}>{state.players.length < 2 ? "Waiting for one more player" : "Begin service"}</Button> : <p className="waiting-note">The captain will start when the crew is ready.</p>}{error && <p className="error" role="alert">{error}</p>}</section></main>;
}

function Flight({ state, meId, now, busy, error, onAction }: { state: PublicGameState; meId: string; now: number; busy: boolean; error: string; onAction: (action: string, extra?: Record<string, unknown>) => void }) {
  const me = state.players.find((player) => player.id === meId)!;
  const countdown = Math.max(0, Math.ceil(((state.startedAt ?? now) - now) / 1000));
  const seconds = Math.min(180, Math.max(0, Math.ceil(((state.endsAt ?? now) - now) / 1000)));
  const moveLock = useRef(false);
  useEffect(() => {
    const move = (direction: number) => {
      const current = state.players.find((player) => player.id === meId);
      if (!current || moveLock.current || busy || countdown > 0) return;
      const row = Math.max(0, Math.min(6, current.row + direction));
      if (row === current.row) return;
      moveLock.current = true;
      onAction("move", { row });
      window.setTimeout(() => { moveLock.current = false; }, 130);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "w", "W", "s", "S"].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") move(-1);
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") move(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, countdown, meId, onAction, state.players]);
return <main className="flight-shell">{countdown > 0 && <div className="flight-countdown" role="status" aria-live="assertive"><span>Prepare for service</span><strong>{countdown}</strong><p>Get ready, cabin crew!</p></div>}<header className="game-header"><Brand /><div className="flight-stats"><span><Clock3 />{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span><span><Users />{state.players.length} crew</span><span className="code-pill">Level {state.level} · {state.code}</span></div></header><section className="scorebar"><div><span>Passenger satisfaction</span><strong>{state.satisfaction}% <small>· Goal {state.target}%</small></strong></div><Progress value={state.satisfaction} /></section><div className="game-layout"><aside className="supply-panel"><h2>Galley supplies</h2><p>Stand in the galley to collect. Carry up to two.</p><div className="keyboard-hint"><Keyboard /> Move your sprite with <kbd>W</kbd><kbd>S</kbd> or arrow keys</div><div className="supplies">{ITEMS.map((item) => <SupplyButton key={item} item={item} disabled={busy} onClick={() => onAction("take", { item })} />)}</div><Tray inventory={me.inventory} busy={busy} onAction={onAction} />{error && <p className="error" role="alert">{error}</p>}</aside><Cabin state={state} meId={meId} now={now} busy={busy} onAction={onAction} /><aside className="request-panel"><h2>Open requests <span>{state.requests.length}</span></h2><p>Urgent requests rise to the top.</p><div className="request-list">{[...state.requests].sort((a, b) => a.expiresAt - b.expiresAt).map((request) => <RequestCard key={request.id} request={request} now={now} canServe={me.row === request.row && me.inventory.includes(request.item)} busy={busy} onServe={() => onAction("serve", { requestId: request.id })} />)}{state.requests.length === 0 && <div className="all-clear"><Check />Cabin is all clear</div>}</div></aside></div><nav className="mobile-controls" aria-label="Movement"><Button disabled={busy || me.row === 0} onClick={() => onAction("move", { row: me.row - 1 })}>Toward galley</Button><span>Row {me.row || "G"}</span><Button disabled={busy || me.row === 6} onClick={() => onAction("move", { row: me.row + 1 })}>Toward tail</Button></nav></main>;
}

function Cabin({ state, meId, now, busy, onAction }: { state: PublicGameState; meId: string; now: number; busy: boolean; onAction: (action: string, extra?: Record<string, unknown>) => void }) {
  const requests = useMemo(() => new Map(state.requests.map((request) => [request.seat, request])), [state.requests]);
  return <section className="cabin" aria-label="Airplane cabin"><div className="cockpit"><Plane /> FLIGHT DECK</div><div className="sprite-layer" aria-label="Crew positions">{state.players.map((player, index) => <span className={`crew-sprite ${player.id === meId ? "my-sprite" : ""}`} key={player.id} title={`${player.name}, ${player.row === 0 ? "galley" : `row ${player.row}`}`} style={{ "--sprite-row": player.row, "--sprite-offset": `${(index - (state.players.length - 1) / 2) * 28}px`, "--sprite-color": player.color } as CSSProperties}><UserRound /><b>{player.name}</b></span>)}</div><div className="galley-row"><span>GALLEY</span><AisleCell row={0} state={state} meId={meId} busy={busy} onMove={() => onAction("move", { row: 0 })} /><span>GALLEY</span></div>{Array.from({ length: 6 }, (_, index) => index + 1).map((row) => <div className="seat-row" key={row}><Seat seat={`${row}A`} request={requests.get(`${row}A`)} now={now} /><AisleCell row={row} state={state} meId={meId} busy={busy} onMove={() => onAction("move", { row })} /><Seat seat={`${row}F`} request={requests.get(`${row}F`)} now={now} /></div>)}<div className="tail">TAIL</div></section>;
}

function AisleCell({ row, state, meId, busy, onMove }: { row: number; state: PublicGameState; meId: string; busy: boolean; onMove: () => void }) {
  const occupants = state.players.filter((player) => player.row === row); const me = state.players.find((player) => player.id === meId)!;
  return <button className={`aisle-cell ${me.row === row ? "current" : ""}`} disabled={busy || Math.abs(me.row - row) > 1} onClick={onMove} aria-label={`Move to ${row === 0 ? "galley" : `row ${row}`}`}><small>{row === 0 ? "G" : row}</small><span className="occupants">{occupants.map((player) => <i key={player.id} title={player.name} style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</i>)}</span></button>;
}

function Seat({ seat, request, now }: { seat: string; request?: PassengerRequest; now: number }) {
  const Icon = request ? ITEM_ICONS[request.item] : Armchair; const remaining = request ? Math.max(0, (request.expiresAt - now) / (request.expiresAt - request.createdAt) * 100) : 0;
  return <div className={`seat ${request ? "requesting" : ""}`}><span className="seat-number">{seat}</span><Icon /><span className="passenger-head" />{request && <><b>{ITEM_LABELS[request.item]}</b><span className="patience"><i style={{ width: `${remaining}%` }} /></span></>}</div>;
}

function Tray({ inventory, busy, onAction }: { inventory: Item[]; busy: boolean; onAction: (action: string, extra?: Record<string, unknown>) => void }) {
return <section className="inventory" aria-label="Your tray"><span>Your tray</span><div>{[0, 1].map((slot) => <div className="tray-slot" data-tray-slot={slot} key={slot} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const item = event.dataTransfer.getData("supply"); if (ITEMS.includes(item as Item) && !busy) onAction(inventory[slot] ? "replace" : "take", { slot, item }); }}>{inventory[slot] ? <><div draggable={!busy} onDragStart={(event) => { event.dataTransfer.setData("tray-slot", String(slot)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={(event) => { const bounds = event.currentTarget.closest(".inventory")?.getBoundingClientRect(); if (!busy && bounds && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onAction("discard", { slot }); }}><ItemChip item={inventory[slot]} /></div></> : <i>Drop supply here</i>}</div>)}</div><p className="tray-help">Drag a supply onto a slot to replace it. Drag a tray item outside to discard. On touch screens, select a slot below.</p><div className="touch-replace">{inventory.map((item, slot) => <label key={slot}>Slot {slot + 1}<select aria-label={`Replace tray slot ${slot + 1}`} value={item} disabled={busy} onChange={(event) => onAction("replace", { slot, item: event.target.value })}>{ITEMS.map((supply) => <option key={supply} value={supply}>{ITEM_LABELS[supply]}</option>)}</select></label>)}</div></section>;
}
function SupplyButton({ item, disabled, onClick }: { item: Item; disabled: boolean; onClick: () => void }) { const Icon = ITEM_ICONS[item]; return <Button variant="outline" draggable onDragStart={(event) => { event.dataTransfer.setData("supply", item); event.dataTransfer.effectAllowed = "copy"; }} aria-label={`Collect or drag ${ITEM_LABELS[item]}`} disabled={disabled} onClick={onClick}><Icon />{ITEM_LABELS[item]}</Button>; }
function ItemChip({ item }: { item: Item }) { const Icon = ITEM_ICONS[item]; return <b><Icon />{ITEM_LABELS[item]}</b>; }
function RequestCard({ request, now, canServe, busy, onServe }: { request: PassengerRequest; now: number; canServe: boolean; busy: boolean; onServe: () => void }) { const seconds = Math.max(0, Math.ceil((request.expiresAt - now) / 1000)); return <div className={`request-card ${seconds <= 7 ? "urgent" : ""}`}><div><span className="request-seat">{request.seat}</span><ItemChip item={request.item} /></div><div><span>{seconds}s patience</span><Button size="sm" disabled={!canServe || busy} onClick={onServe}>Serve</Button></div></div>; }

function Results({ state, meId, busy, error, onRematch, onLeave }: { state: PublicGameState; meId: string; busy: boolean; error: string; onRematch: () => void; onLeave: () => void }) {
  const winner = [...state.players].sort((a, b) => b.served - a.served)[0]; const isHost = state.hostId === meId;
  return <main className="screen-shell"><header className="topbar"><Brand /><Button variant="ghost" onClick={onLeave}>Leave room</Button></header><section className="results-card"><div className={`result-emblem ${state.result === "won" ? "won" : ""}`}><Plane /></div><p className="eyebrow">Level {state.level} complete</p><h1>{state.result === "won" ? "Cabin service cleared!" : "Landed—but the cabin needed more care."}</h1><p>Your crew finished with <strong>{state.satisfaction}%</strong> satisfaction.</p><div className="award"><Crown /><div><span>Cabin MVP</span><strong>{winner?.name}</strong><small>{winner?.served ?? 0} passengers served</small></div></div><div className="result-actions">{isHost ? <Button className="primary-action" disabled={busy} onClick={onRematch}>{state.result === "won" ? `Next level: ${state.level + 1}` : `Retry level ${state.level}`}</Button> : <p>Waiting for the captain to call the next flight.</p>}<Button variant="outline" onClick={onLeave}>Return home</Button></div>{error && <p className="error" role="alert">{error}</p>}</section></main>;
}
