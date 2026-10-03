export const ITEMS = ["water", "coffee", "snack", "blanket"] as const;
export type Item = (typeof ITEMS)[number];

export type Player = { id: string; secret: string; name: string; color: string; row: number; aisle: number; inventory: Item[]; served: number };
export type PassengerRequest = { id: string; seat: string; row: number; side: "left" | "right"; item: Item; createdAt: number; expiresAt: number };
export type GameState = {
  code: string; phase: "lobby" | "playing" | "results"; hostId: string; level: number;
  players: Player[]; requests: PassengerRequest[]; satisfaction: number; target: number; passengerSatisfaction: Record<string, number>;
  startedAt: number | null; endsAt: number | null; nextRequestAt: number | null; result: "won" | "landed" | null;
};
export type PublicPlayer = Omit<Player, "secret">;
export type PublicGameState = Omit<GameState, "players"> & { players: PublicPlayer[]; serverNow: number };

const COLORS = ["#ff6b4a", "#09a6a6", "#7657d6", "#e7a51a", "#e85791", "#3974d4"];
const ROUND_MS = 3 * 60 * 1000;
const REQUEST_MS = 36 * 1000;

export function cabinLayout(level = 1) {
  const blocks = level >= 5 ? [3, 3, 3] : level >= 4 ? [3, 3] : level >= 3 ? [2, 2] : level >= 2 ? [1, 2] : [1, 1];
  let index = 0;
  return blocks.map((size) => Array.from({ length: size }, () => String.fromCharCode(65 + index++)));
}

export function cabinSeats(level = 1) {
  const letters = cabinLayout(level).flat();
  return Array.from({ length: 6 }, (_, index) => index + 1).flatMap((row) => letters.map((letter) => `${row}${letter}`));
}

export function ensurePassengerSatisfaction(state: GameState) {
  const existing = state.passengerSatisfaction ?? {};
  state.passengerSatisfaction = Object.fromEntries(cabinSeats(state.level).map((seat) => [seat, existing[seat] ?? state.satisfaction]));
}

export function updatePassengerSatisfaction(state: GameState, seat: string, change: number) {
  ensurePassengerSatisfaction(state);
  state.passengerSatisfaction[seat] = Math.max(0, Math.min(100, state.passengerSatisfaction[seat] + change));
  const values = Object.values(state.passengerSatisfaction);
  state.satisfaction = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function makePlayer(name: string, index: number): Player {
  return { id: crypto.randomUUID(), secret: crypto.randomUUID(), name: name.slice(0, 18), color: COLORS[index % COLORS.length], row: 0, aisle: 0, inventory: [], served: 0 };
}

export function makeRoom(code: string, player: Player): GameState {
  const state: GameState = { code, phase: "lobby", hostId: player.id, level: 1, players: [player], requests: [], satisfaction: 60, target: 65, passengerSatisfaction: {}, startedAt: null, endsAt: null, nextRequestAt: null, result: null };
  ensurePassengerSatisfaction(state);
  return state;
}

export function publicState(state: GameState, now = Date.now()): PublicGameState {
  ensurePassengerSatisfaction(state);
  return { ...state, level: state.level ?? 1, players: state.players.map((player) => ({ id: player.id, name: player.name, color: player.color, row: player.row, aisle: player.aisle ?? 0, inventory: player.inventory, served: player.served })), serverNow: now };
}

export function startRound(state: GameState, now: number) {
  state.level ??= 1;
  state.target = Math.min(75, 65 + (state.level - 1));
  Object.assign(state, { phase: "playing", satisfaction: 60, startedAt: now + 3000, endsAt: now + 3000 + ROUND_MS, nextRequestAt: now + 3000, result: null, requests: [] });
  state.passengerSatisfaction = Object.fromEntries(cabinSeats(state.level).map((seat) => [seat, 60]));
  state.players.forEach((player) => { player.row = 0; player.aisle = 0; player.inventory = []; player.served = 0; });
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
    expired.forEach((request) => updatePassengerSatisfaction(state, request.seat, -8));
    changed = true;
  }
  if (state.endsAt && now >= state.endsAt) {
    state.phase = "results";
    state.result = state.satisfaction >= state.target ? "won" : "landed";
    return true;
  }
  if ((state.nextRequestAt ?? Infinity) <= now && state.requests.length < Math.min(18, 4 + state.level * 2)) {
    const occupied = new Set(state.requests.map((request) => request.seat));
    const seats = cabinSeats(state.level).filter((seat) => !occupied.has(seat));
    if (seats.length) {
      const seat = seats[choice(now, seats.length)];
      const row = Number.parseInt(seat, 10);
      const patience = REQUEST_MS - Math.min(4, state.level - 1) * 1000 + (cabinLayout(state.level).length > 2 ? 6000 : 0);
      state.requests.push({ id: crypto.randomUUID(), seat, row, side: seat.endsWith("A") ? "left" : "right", item: ITEMS[choice(now + row * 31, ITEMS.length)], createdAt: now, expiresAt: now + patience });
      changed = true;
    }
    state.nextRequestAt = now + Math.max(3500, 7500 - state.players.length * 400 - ((state.level ?? 1) - 1) * 400);
    changed = true;
  }
  return changed;
}
