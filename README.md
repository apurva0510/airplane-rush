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
