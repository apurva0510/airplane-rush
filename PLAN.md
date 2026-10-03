# Airplane Rush — Project Plan

## Product goal

Build a cooperative multiplayer party game for 2–6 players. Everyone joins the
same airplane with a room code and works as cabin crew. Players collect supplies,
navigate a crowded aisle, and fulfill passenger requests before the plane lands.

The game should be understandable without an explanation: a short tutorial,
visible passenger requests, clear controls, and immediate feedback should teach
the complete loop.

## MVP rules

- One room supports 2–6 named players without accounts.
- The host can start a five-minute round once at least two players have joined.
- The cabin contains one galley, one aisle, and 20 passenger seats.
- Passengers request water, coffee, snacks, or blankets.
- Players can move, carry at most two items, collect supplies, and serve a seat.
- Requests have patience meters and expire if ignored.
- Correct and timely deliveries increase a shared satisfaction score.
- Wrong deliveries and expired requests reduce satisfaction.
- The group wins by reaching the satisfaction target before landing.
- The results screen shows the shared result and lighthearted player awards.
- Everyone can choose to play another round in the same room.

## Design principles

1. **Cooperation over competition.** Individual statistics are celebratory; the
   team wins or loses together.
2. **Readable chaos.** Difficulty comes from prioritization and coordination,
   not unclear controls.
3. **Phone-first controls.** Use tap-to-move or large directional controls that
   also work with a keyboard on laptops.
4. **One authoritative world.** Clients submit actions; the room validates them
   and broadcasts the resulting state.
5. **Small first flight.** Do not add carts, luggage, boarding, or complex events
   until the basic service loop is fun and reliable.

## Core screens

1. **Home:** create a room or join with a room code and display name.
2. **Lobby:** show joined players, instructions, and the host's start button.
3. **Game:** show the shared cabin, timer, satisfaction, requests, and inventory.
4. **Results:** show win/loss, team score, player contributions, and rematch.

## Shared game state

The authoritative room state should contain:

- room code, phase, host, and connected players;
- player positions, appearance, inventory, and contribution statistics;
- passenger seats, active requests, and patience remaining;
- galley supply counts;
- shared satisfaction, target score, and round timer;
- active events and a monotonically increasing state version.

Player devices send intentions such as `move`, `takeItem`, and `servePassenger`.
The room validates each intention, updates the state once, and sends the result
to every player. This prevents two players from completing the same request.

## Delivery milestones

### Milestone 1 — Walking prototype

- Create and join rooms with a short code.
- Render a simple cabin grid.
- Show every connected player in the same room.
- Synchronize player movement across two devices.

**Exit test:** two browser windows can join one room and see each other move with
no refresh.

### Milestone 2 — Service loop

- Add the galley and four supply types.
- Add passenger request generation and patience timers.
- Add two-item player inventories.
- Validate pickup and delivery actions on the authoritative room.
- Add score and satisfaction feedback.

**Exit test:** two players can complete and fail requests while both screens
remain consistent.

### Milestone 3 — Complete round

- Add lobby, host start, synchronized timer, win/loss conditions, and results.
- Handle players joining, leaving, reconnecting, and attempting invalid actions.
- Add rematches that reset state without requiring a new room code.

**Exit test:** a full round can be played from lobby through rematch on phones
and laptops.

### Milestone 4 — Teaching and polish

- Add a 20–30 second interactive tutorial or illustrated rules panel.
- Improve cabin art, animation, sound feedback, and accessibility.
- Add player awards such as Fastest Server and Most Helpful Teammate.
- Deploy at a public link and run several outside playtests.

**Exit test:** a new group can join and finish a round without verbal guidance.

### Milestone 5 — Optional expansion

Only after the MVP is stable, consider:

- turbulence that briefly pauses service or drops unsecured items;
- blocked aisle spaces and item handoffs;
- trash collection and limited supplies;
- cooperative two-player luggage tasks;
- boarding and landing phases;
- additional airplane layouts or difficulty settings.

## Testing strategy

- Unit-test scoring, request expiration, inventory limits, and action validation.
- Test duplicate and simultaneous service attempts.
- Test disconnect and reconnect behavior during lobby, game, and results phases.
- Test with throttled or interrupted connections.
- Verify the layout and controls on a phone, tablet, and laptop.
- Conduct at least three playtests with people who have not seen the game.

## Scope guardrails

For the first public version, exclude voice chat, accounts, matchmaking, custom
levels, purchases, realistic flight simulation, AI passengers, and persistent
progress. These features do not prove the central multiplayer experience.

## Immediate next decisions

Before implementation begins, choose:

1. Keyboard movement on laptops with large touch controls on phones.
2. Top-down cabin view or a simplified side/isometric view.
3. The multiplayer runtime and hosting stack supported by the build environment.
4. A temporary visual style: clean colored shapes first, illustrated art later.

The selected defaults are keyboard-first row movement with touch fallbacks, a
top-down cabin, and simple character sprites during the synchronization prototype.
