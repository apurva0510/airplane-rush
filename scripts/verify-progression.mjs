// Local-only integration check. Never point this fixture at a hosted database.
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
async function post(path, body, cookie = "") {
  const response = await fetch(`${base}/api/${path}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
const owner = await post("progression", { action: "init" });
assert.equal(owner.status, 200);
const cookie = owner.cookie;
const created = await post("rooms", { operation: "create", name: "Progress QA" }, cookie);
assert.equal(created.status, 201);
const { state, playerId, secret } = created.data;
const claim = { action: "claim", code: state.code, playerId, secret };
assert.equal((await post("progression", claim, cookie)).status, 400);
state.phase = "results"; state.result = "won"; state.startedAt = Date.now() - 183000;
state.endsAt = Date.now() - 1; state.players[0].served = 6;
// Public state deliberately excludes the private profile binding. Restore it from the local row.
const publicJson = JSON.stringify(state).replaceAll("'", "''");
const sql = `UPDATE rooms SET state=json_set('${publicJson}', '$.players[0].secret',json_extract(state,'$.players[0].secret'),'$.players[0].profileId',json_extract(state,'$.players[0].profileId')) WHERE code='${state.code}'`;
execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state", "--command", sql], { stdio: "pipe" });
const foreign = await post("progression", { action: "init" });
assert.equal((await post("progression", claim, foreign.cookie)).status, 400);
const claimed = await Promise.all([post("progression", claim, cookie), post("progression", claim, cookie)]);
assert.ok(claimed.every(r => r.status === 200));
const response = await fetch(`${base}/api/progression`, { headers: { cookie } });
const records = await response.json();
assert.equal(records.profile.coins, 60); assert.equal(records.profile.score, 1150);
assert.equal(records.profile.flights, 1); assert.equal(records.profile.served, 6);
assert.ok(records.leaderboard.some(r => r.name === "Progress QA" && r.score === 1150));
assert.equal((await post("progression", { action: "buy", item: "gold" }, cookie)).status, 400);
const bought = await post("progression", { action: "buy", item: "ocean" }, cookie);
assert.equal(bought.data.profile.coins, 0); assert.equal(bought.data.profile.equipped, "ocean");
const repeat = await post("progression", { action: "buy", item: "ocean" }, cookie);
assert.equal(repeat.data.profile.coins, 0);
const nextRoom = await post("rooms", { operation: "create", name: "Progress QA" }, cookie);
assert.equal(nextRoom.data.state.players[0].color, "#09a6a6");
assert.ok(!("profileId" in nextRoom.data.state.players[0]));
console.log("PASS: finished-flight rewards, concurrent duplicate claims, foreign-player rejection, leaderboard, balance checks, unlocks, equipped colors, private identity.");
