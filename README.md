# emberline-night-shift

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Indodegen/emberline-night-shift/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Indodegen/emberline-night-shift/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter in the Counter-Strike style, built
with three.js for the [make.fun](https://make.fun) bounty `threejs-fps-02`.

**Two teams, one yard, after dark.** You are Vanguard, attacking with two bot
teammates (ASH, REX). Sentinel defends with three bots (ORIN, MIRA, DUSK).
First team to **4 rounds** wins the match. This entry is the night-shift
rebuild of the first Emberline yard: the same yard at night, with lamps that
pool light, pulsing site beacons, per-weapon ADS zoom, a kill streak on the
HUD, and bots that strafe while they shoot instead of planting their feet.

## Run it

```sh
node serve.ts --port 8901
# open http://localhost:8901/
```

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards

## How a round works

1. **Buy phase (12 s)** — spend your money: `1` KR-7 Carbine ($900), `2` Longshot
   DMR ($1,500), `3` Frag-9 Grenade ($300), `4` P9 Sidearm (free). Kills pay
   $300, a round win $1,400, a loss $800, planting the spike $300. Die and you
   lose your rifle — buy it again next round.
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
| 1 / 2 / 3 / 4 | Switch weapon (live) / buy weapon (buy phase) |
| Esc | Pause |

**Gunplay rules:** standing still shoots straight; firing on the move widens
your spread; crouching and ADS tighten it. ADS zooms per weapon — the
Longshot scopes to 34° FOV, the KR-7 to 52°, the P9 barely zooms to 65° —
because a DMR and a sidearm should not feel the same when you aim. Headshots
deal 3× damage with the KR-7 and 2× with the P9 and Longshot. Bots react
after a human-ish delay, fire in bursts, **strafe sideways while engaging**,
hold lanes, rotate on the sound of gunfire, and plant / defuse with the same
timers you do. One Sentinel is a **flanker**: it holds the mid-east connector
and swaps between the two connectors while it waits, so mid is never safe
twice in a row.

**HUD:** round pips under the score show the first-to-4 race at a glance, a
streak chip appears under the crosshair after two kills without dying, and a
carrier tag names whoever holds the spike.

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
  `bots.js` (state machines, strafe, flanker), `player.js` (movement),
  `weapons.js` (arsenal + view models + per-weapon ADS FOV),
  `effects.js` (pooled tracers/sparks/explosions), `audio.js` (synthesised
  WebAudio SFX — no audio files), `hud.js` (round pips, streak, carrier),
  `input.js`, `rng.js`, `palette.js`.
- `main.ts` — the entrypoint: copies `game/`, screenshots and `dossier.json`
  into `/output` deterministically.
- No build step, no network at runtime, no key, no purchase.

Screenshot presets (deterministic, `?shot=<name>&seed=7`):

- `spawn` — from the Vanguard spawn, down mid toward site A
- `mid` — mid lane under the gantry lamp
- `a-site` — site A with its amber plate
- `clash` — from the east side of site B, the teal plate, its holder and the
  B push all on one sightline

## License

MIT — see `LICENSE`. The map, names, art and sounds are original.
