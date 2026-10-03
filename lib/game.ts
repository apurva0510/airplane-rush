export const ITEMS = ["water", "coffee", "snack", "blanket"] as const;
export type Item = (typeof ITEMS)[number];

export type Player = { id: string; secret: string; name: string; color: string; row: number; inventory: Item[]; served: number };
export type PassengerRequest = { id: string; seat: string; row: number; side: "left" | "right"; item: Item; createdAt: number; expiresAt: number };
export type GameState = {
  code: string; phase: "lobby" | "playing" | "results"; hostId: string; level: number;
  players: Player[]; requests: PassengerRequest[]; satisfaction: number; target: number;
  startedAt: number | null; endsAt: number | null; nextRequestAt: number | null; result: "won" | "landed" | null;
};
export type PublicPlayer = Omit<Player, "secret">;
export type PublicGameState = Omit<GameState, "players"> & { players: PublicPlayer[]; serverNow: number };

const COLORS = ["#ff6b4a", "#09a6a6", "#7657d6", "#e7a51a", "#e85791", "#3974d4"];
const ROUND_MS = 3 * 60 * 1000;
const REQUEST_MS = 24 * 1000;

export function makePlayer(name: string, index: number): Player {
  return { id: crypto.randomUUID(), secret: crypto.randomUUID(), name: name.slice(0, 18), color: COLORS[index % COLORS.length], row: 0, inventory: [], served: 0 };
}

export function makeRoom(code: string, player: Player): GameState {
  return { code, phase: "lobby", hostId: player.id, level: 1, players: [player], requests: [], satisfaction: 50, target: 70, startedAt: null, endsAt: null, nextRequestAt: null, result: null };
}

export function publicState(state: GameState, now = Date.now()): PublicGameState {
  return { ...state, level: state.level ?? 1, players: state.players.map((player) => ({ id: player.id, name: player.name, color: player.color, row: player.row, inventory: player.inventory, served: player.served })), serverNow: now };
}

export function startRound(state: GameState, now: number) {
  state.level ??= 1;
  state.target = Math.min(95, 70 + (state.level - 1) * 5);
  Object.assign(state, { phase: "playing", satisfaction: 50, startedAt: now + 3000, endsAt: now + 3000 + ROUND_MS, nextRequestAt: now + 3000, result: null, requests: [] });
  state.players.forEach((player) => { player.row = 0; player.inventory = []; player.served = 0; });
  tick(state, now);
}

function choice(seed: number, length: number) {
  const mixed = Math.abs(Math.sin(seed * 12.9898) * 43758.5453);
  return Math.floor((mixed - Math.floor(mixed)) * length);
}

export function tick(state: GameState, now: number) {
  if (state.phase !== "playing") return false;
  if (state.startedAt && now < state.startedAt) return false;
  let changed = false;
  const expired = state.requests.filter((request) => request.expiresAt <= now);
  if (expired.length) {
    state.requests = state.requests.filter((request) => request.expiresAt > now);
    state.satisfaction = Math.max(0, state.satisfaction - expired.length * 3);
    changed = true;
  }
  if (state.endsAt && now >= state.endsAt) {
    state.phase = "results";
    state.result = state.satisfaction >= state.target ? "won" : "landed";
    return true;
  }
  if ((state.nextRequestAt ?? Infinity) <= now && state.requests.length < 6) {
    const occupied = new Set(state.requests.map((request) => request.seat));
    const seats = Array.from({ length: 6 }, (_, index) => index + 1).flatMap((row) => [`${row}A`, `${row}F`]).filter((seat) => !occupied.has(seat));
    if (seats.length) {
      const seat = seats[choice(now, seats.length)];
      const row = Number.parseInt(seat, 10);
      state.requests.push({ id: crypto.randomUUID(), seat, row, side: seat.endsWith("A") ? "left" : "right", item: ITEMS[choice(now + row * 31, ITEMS.length)], createdAt: now, expiresAt: now + Math.max(12000, REQUEST_MS - ((state.level ?? 1) - 1) * 2000) });
      changed = true;
    }
    state.nextRequestAt = now + Math.max(2200, 6500 - state.players.length * 450 - ((state.level ?? 1) - 1) * 600);
    changed = true;
  }
  return changed;
}
