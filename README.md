# Airplane Rush

A cooperative multiplayer cabin-crew game for 2–6 players. Create a flight,
share the five-character room code, and work together from separate devices to
serve passengers before landing.

## Local development

```bash
npm install
npm run db:generate
npm run build
npm run dev
```

For a fresh local D1 database, apply the generated migration using the command
documented in the Sites starter before creating a room.

## Verification

```bash
npm run lint
npm run build
```

See [PLAN.md](./PLAN.md) for the rules, architecture, milestones, and optional
post-MVP ideas.
# Crew progression

Browser crew passes are authenticated with an HttpOnly cookie; coins, scores, owned colors, and milestones live in D1. Progress is browser-bound (no account/login or cross-device recovery yet). Player names and completed-flight scores appear publicly on the leaderboard.

Completed flights earn 10 coins, each delivery adds 5, and a level clear adds 20. Lifetime score awards 100 per delivery, 500 per clear, and 50 per completed level. Cosmetics never change gameplay. Rewards use an atomic, unique per-profile/per-round ledger to prevent duplicate payouts. The server settles every player's rewards at landing and before rematch.

Run `node scripts/verify-progression.mjs` against the local dev server after applying migrations to check rewards, duplicate claims, ownership, spending, leaderboard, and cosmetics. The script creates local-only QA fixtures; it cannot target production.
