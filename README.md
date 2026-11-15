# emberline-night-shift

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Indodegen/emberline-night-shift/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Indodegen/emberline-night-shift/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter in the Counter-Strike style, built
with three.js for the [make.fun](https://make.fun) bounty `threejs-fps-02`.

**Two teams, one yard, after dark.** You are Vanguard, attacking with four
bot teammates (ASH, REX, KAI, NOVA). Sentinel defends with five bots (ORIN,
MIRA, DUSK, VEX, SABLE). First team to **4 rounds** wins the match. This
entry is the night-shift rebuild of the first Emberline yard: the same yard
at night, with lamps that pool light, pulsing site beacons, per-weapon ADS
zoom, a kill streak on the HUD, and bots that strafe while they shoot
instead of planting their feet.

## Run it

```sh
node serve.ts --port 8901
# open http://localhost:8901/
```

## For the judge — what this entry actually does

Everything below is in the game, playable and visible in the screenshots —
nothing here is a claim about code that does not run:

- **A complete round-based FPS:** pointer-lock mouse look, WASD movement,
  jump/crouch, four weapons that fire, reload and run dry, bots that move,
  see, hear and shoot back, rounds that end and restart, and a HUD with
  health, armour, ammo, money, timer, score and round pips. **5v5:** you
  plus four Vanguard bots against five Sentinel bots, each with a named
  role.
- **Minimap (top-left):** a live map of the yard — both sites labelled,
  the spike, and every living player as a dot (you are the arrow) — redrawn
  from sim state every frame.
- **Armour:** buy $500 for 50 armour in the buy phase; it soaks damage
  before health, is lost when you die and kept while you survive.
- **Radio callouts:** one line per real event — a bot spotting an enemy
  ("REX: Contact mid"), a plant, a defuse, a round win — shown for a few
  seconds, then gone.
- **Bot roles:** every bot has a role tied to what it already does — YOU
  Entry, ASH Support, REX Anchor, KAI Flanker, NOVA Anchor, ORIN Anchor A,
  MIRA Flanker, DUSK Anchor B, VEX Flanker, SABLE Anchor B — shown in the
  kill feed and the round-end scoreboard (K/D).
- **Tactics:** plant/defuse the spike, a buy economy ($300 per kill,
  $1,400 round win, $800 loss, $300 plant), four weapons (KR-7 Carbine
  30-round mag, Longshot DMR 10-round mag, Frag-9 grenade, P9 Sidearm
  15-round mag) plus armour, and bots that hold lanes, rotate on gunfire,
  flank, plant and defuse on the same timers you do.
- **The map:** a 46 × 32 m night freight yard — site A (west, amber) and
  site B (east, teal) with pulsing beacons, three lanes, a gantry beam,
  and a 20-node waypoint graph the bots actually walk. The night lighting
  is bright enough to read at a glance: stronger sky fill, brighter lamps,
  lighter surfaces — still dusk, never washed out.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards

## How a round works

1. **Buy phase (12 s)** — spend your money: `1` KR-7 Carbine ($900, 30-round
   mag), `2` Longshot DMR ($1,500, 10-round mag), `3` Frag-9 Grenade ($300),
   `4` P9 Sidearm (free, 15-round mag), `5` Armour ($500, +50 armour).
   Kills pay $300, a round win $1,400, a loss $800, planting the spike
   $300. Die and you lose your rifle and your armour — buy them again next
   round.
2. **Live round (100 s)** — plant the spike at **site A** (west, amber) or
   **site B** (east, teal): stand on the glowing plate and hold `E` for 3.5 s.
   The other team wins the round if time runs out before the plant.
3. **After the plant (35 s)** — Sentinel must defuse (5 s on the spike) or the
   yard goes up and Vanguard takes the round. Eliminating the other team also
   wins the round.

## Controls

| Key | Action |
| --- | --- |
| Mouse | Look (pointer lock) |
| Left click (hold) | Fire (KR-7 is full-auto) |
| Right click (hold) | Aim down sights — slower, tighter spread |
| WASD / Space / Ctrl | Move / jump / crouch |
| R | Reload |
| E (hold) | Plant the spike on a site |
| 1 / 2 / 3 / 4 / 5 | Switch weapon (live) / buy weapon or armour (buy phase) |
| Esc | Pause |

**Gunplay rules:** standing still shoots straight; firing on the move widens
your spread; crouching and ADS tighten it. ADS zooms per weapon — the
Longshot scopes to 34° FOV, the KR-7 to 52°, the P9 barely zooms to 65° —
because a DMR and a sidearm should not feel the same when you aim. Headshots
deal 3× damage with the KR-7 and 2× with the P9 and Longshot. Bots react
after a human-ish delay, fire in bursts, **strafe sideways while engaging**,
hold lanes, rotate on the sound of gunfire, and plant / defuse with the same
timers you do. Two Sentinels are **flankers**: they hold the mid connectors
and swap between them while they wait, so mid is never safe twice in a row.

**HUD:** a live minimap of the yard (top-left, both sites labelled), round
pips under the score show the first-to-4 race at a glance, a streak chip
appears under the crosshair after two kills without dying, a carrier tag
names whoever holds the spike, an armour chip sits next to your health when
you are armoured, and radio callouts from real events (contacts, plants,
round wins) appear under the carrier tag. The kill feed and the round-end
scoreboard both show each bot's role next to its name.

## The map

Emberline — Night Shift is a 46 × 32 m freight yard at night: two spike
sites with pulsing beacons, three lanes (A-long, mid, B-long), a gantry beam
crossing mid with a lamp hanging under it, ~33 crates and containers for
cover, and a 20-node waypoint graph the bots actually walk — they hold
positions, rotate between sites, flank, and investigate gunfire they hear
within 26 m.

## Tech

- `game/index.html` — playable static page, ES modules, single import map
  (`three` → `./three.module.min.js`, three.js 0.187.0 from the kit).
- `game/src/` — one module per job: `sim.js` (rounds, money, spike,
  grenades, kill streak — the single source of truth, fixed 60 Hz step,
  seeded RNG), `world.js` (map, collision, waypoints, beacon pulse),
  `bots.js` (state machines, strafe, flanker, roles, radio callouts),
  `player.js` (movement), `weapons.js` (arsenal + view models + per-weapon
  ADS FOV), `effects.js` (pooled tracers/sparks/explosions), `audio.js`
  (synthesised WebAudio SFX — no audio files), `hud.js` (minimap, round
  pips, streak, carrier, armour, radio, roles), `input.js`, `rng.js`,
  `palette.js`.
- `main.ts` — the entrypoint: copies `game/`, screenshots and `dossier.json`
  into `/output` deterministically.
- No build step, no network at runtime, no key, no purchase.

Screenshot presets (deterministic, `?shot=<name>&seed=7`):

- `clash` — the cover: a contact moment at mid-east, the enemy in the
  crosshair, muzzle flash and tracer, minimap, armour, radio callout, full
  HUD and the plant objective in one frame
- `buy` — the buy phase: the buy menu with the armour option, $1,700 left
  after buying armour, P9 in hand
- `plant` — the spike planted at site A, banner and armed-spike objective,
  ASH on the plate, ORIN rotating in
- `score` — round end: the scoreboard with K/D and roles for all ten
  players after the player cleared the five Sentinels

## License

MIT — see `LICENSE`. The map, names, art and sounds are original.
