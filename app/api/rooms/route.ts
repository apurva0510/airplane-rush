import { env } from "cloudflare:workers";
import { ITEMS, GameState, Item, makePlayer, makeRoom, publicState, startRound, tick, updatePassengerSatisfaction, cabinLayout } from "@/lib/game";

export const runtime = "edge";
type RoomRow = { state: string; version: number };

function db() {
  if (!env.DB) throw new Error("Game storage is temporarily unavailable.");
  return env.DB;
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 18) : "";
}

async function loadRoom(roomCode: string) {
  const row = await db().prepare("SELECT state, version FROM rooms WHERE code = ?").bind(roomCode).first<RoomRow>();
  if (!row) return null;
  const state = JSON.parse(row.state) as GameState;
  if (state.target > 100) {
    state.satisfaction = Math.min(100, Math.round(state.satisfaction / state.target * 70));
    state.target = Math.min(95, 70 + ((state.level ?? 1) - 1) * 5);
  }
  return { state, version: row.version };
}

async function saveRoom(roomCode: string, state: GameState, version: number) {
  const result = await db().prepare("UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?")
    .bind(JSON.stringify(state), new Date().toISOString(), roomCode, version).run();
  return result.meta.changes === 1;
}

async function mutateRoom(roomCode: string, mutation: (state: GameState) => string | void) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadRoom(roomCode);
    if (!loaded) return { error: "Room not found.", status: 404 } as const;
    const message = mutation(loaded.state);
    if (message) return { error: message, status: 400 } as const;
    if (await saveRoom(roomCode, loaded.state, loaded.version)) return { state: publicState(loaded.state), status: 200 } as const;
  }
  return { error: "The cabin is busy. Try that again.", status: 409 } as const;
}

export async function GET(request: Request) {
  try {
    const roomCode = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
    if (!roomCode) return Response.json({ error: "Room code is required." }, { status: 400 });
    for (let attempt = 0; attempt < 3; attempt++) {
      const loaded = await loadRoom(roomCode);
      if (!loaded) return Response.json({ error: "Room not found." }, { status: 404 });
      const now = Date.now();
      if (!tick(loaded.state, now) || await saveRoom(roomCode, loaded.state, loaded.version)) {
        return Response.json({ state: publicState(loaded.state, now) });
      }
    }
    return Response.json({ error: "Cabin state changed. Please retry." }, { status: 409 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const operation = String(body.operation ?? "");

    if (operation === "create") {
      const name = cleanName(body.name);
      if (!name) return Response.json({ error: "Enter your crew name." }, { status: 400 });
      for (let attempt = 0; attempt < 8; attempt++) {
        const roomCode = makeCode();
        const player = makePlayer(name, 0);
        const state = makeRoom(roomCode, player);
        const result = await db().prepare("INSERT OR IGNORE INTO rooms (code, state, version, updated_at) VALUES (?, ?, 1, ?)")
          .bind(roomCode, JSON.stringify(state), new Date().toISOString()).run();
        if (result.meta.changes === 1) return Response.json({ state: publicState(state), playerId: player.id, secret: player.secret }, { status: 201 });
      }
      return Response.json({ error: "Could not create a room. Try again." }, { status: 503 });
    }

    const roomCode = String(body.code ?? "").trim().toUpperCase();
    if (operation === "join") {
      const name = cleanName(body.name);
      if (!name) return Response.json({ error: "Enter your crew name." }, { status: 400 });
      let joined: { id: string; secret: string } | null = null;
      const result = await mutateRoom(roomCode, (state) => {
        if (state.phase !== "lobby") return "That flight has already departed.";
        if (state.players.length >= 6) return "That crew is full.";
        if (state.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) return "That crew name is already taken.";
        const player = makePlayer(name, state.players.length);
        joined = { id: player.id, secret: player.secret };
        state.players.push(player);
      });
      if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ state: result.state, playerId: joined!.id, secret: joined!.secret });
    }

    if (operation === "action") {
      const playerId = String(body.playerId ?? "");
      const secret = String(body.secret ?? "");
      const action = String(body.action ?? "");
      const result = await mutateRoom(roomCode, (state) => {
        tick(state, Date.now());
        const player = state.players.find((candidate) => candidate.id === playerId && candidate.secret === secret);
        if (!player) return "Your crew pass is no longer valid.";
        if (action === "start") {
          if (state.hostId !== player.id) return "Only the captain can start the flight.";
          if (state.players.length < 2) return "At least two crew members are required.";
          if (state.phase !== "lobby") return "The flight has already started.";
          startRound(state, Date.now()); return;
        }
        if (action === "rematch") {
          if (state.hostId !== player.id) return "Only the captain can reset the room.";
          if (state.phase !== "results") return "Wait until landing to start another flight.";
          state.level = (state.level ?? 1) + (state.result === "won" ? 1 : 0);
          state.target = Math.min(75, 65 + (state.level - 1));
          Object.assign(state, { phase: "lobby", result: null, requests: [], startedAt: null, endsAt: null }); return;
        }
        if (state.phase !== "playing") return "The flight is not in progress.";
        if (state.startedAt && Date.now() < state.startedAt) return "Service begins after the countdown.";
        if (action === "move") {
          const row = Number(body.row);
          const aisle = body.aisle === undefined ? (player.aisle ?? 0) : Number(body.aisle);
          if (!Number.isInteger(aisle) || aisle < 0 || aisle >= cabinLayout(state.level).length - 1) return "Choose a valid aisle.";
          if (!Number.isInteger(row) || row < 0 || row > 6) return "Choose a valid cabin row.";
          if (Math.abs(row - player.row) > 1) return "Move one row at a time.";
          player.row = row; player.aisle = aisle; return;
        }
        if (action === "emptyTray") {
          player.inventory = []; return;
        }
        if (action === "discard" || action === "replace") {
          const slot = Number(body.slot);
          if (!Number.isInteger(slot) || slot < 0 || slot >= player.inventory.length) return "Choose an occupied tray slot.";
          if (action === "discard") { player.inventory.splice(slot, 1); return; }
          const item = String(body.item ?? "") as Item;
          if (!ITEMS.includes(item)) return "Choose a valid replacement supply.";
          player.inventory[slot] = item; return;
        }
        if (action === "take") {
          const item = String(body.item ?? "") as Item;
          if (!ITEMS.includes(item)) return "That supply is unavailable.";
          if (player.inventory.length >= 2) return "Your hands are full.";
          player.inventory.push(item); return;
        }
        if (action === "serve") {
          const request = state.requests.find((candidate) => candidate.id === String(body.requestId ?? ""));
          if (!request) return "That request is no longer active.";
          if (player.row !== request.row) return `Move to row ${request.row} first.`;
          const block = cabinLayout(state.level).findIndex((letters) => letters.includes(request.seat.slice(-1)));
          if (block !== (player.aisle ?? 0) && block !== (player.aisle ?? 0) + 1) return "Move to the aisle beside that passenger.";
          const itemIndex = player.inventory.indexOf(request.item);
          if (itemIndex === -1) return `You need ${request.item}.`;
          player.inventory.splice(itemIndex, 1);
          player.served += 1;
          state.requests = state.requests.filter((candidate) => candidate.id !== request.id);
          updatePassengerSatisfaction(state, request.seat, 25 + Math.max(0, Math.floor((request.expiresAt - Date.now()) / 5000)));
          return;
        }
        return "Unknown cabin action.";
      });
      if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ state: result.state });
    }
    return Response.json({ error: "Unknown operation." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
