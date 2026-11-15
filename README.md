# Neon Breach — a three.js tactical FPS

A round-based tactical shooter in the style Counter-Strike made famous, built
from scratch on three.js 0.187.0. You are a Viper (attacker) with four bot
teammates against five Sentinel (defender) bots on **Harbor Depot**, an original
container-yard map with two bomb sites, three lanes and a mid connector.

## How a match plays

- **Rounds, first to 5.** A round is won by eliminating the other team, or by
  the attackers planting the bomb and letting it detonate (40 s fuse); the
  defenders win by defusing it or running the 100 s clock out unplanted.
- **Economy and buy menu (B).** You start with $800 and a pistol. Round wins
  pay $3,250, losses $1,900 (+$500 per consecutive loss, capped at $3,400),
  kills $300, a plant $300. Spend it between rounds on a rifle, an SMG, a
  long-range marksman rifle, grenades (frag, flash, smoke) and armor.
- **Gunplay where accuracy counts.** Hitscan fire against body hitboxes with
  4x headshot damage, recoil that kicks the view, and spread that grows with
  movement speed — stopping to aim pays. Crouch to tighten up and hide behind
  low cover.
- **Bots that play the map.** Bots follow waypoint routes to the sites, hold
  angles, react to gunfire they hear, peek and burst-fire when they see you,
  plant the bomb when they carry it, and converge to defuse once it is down.
- **Fixed-step simulation** (60 Hz) kept apart from rendering; all match state
  lives in one place (`src/state.js`); modules have one job each.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Click | Fire |
| R | Reload |
| 1 / 2 / 3 / 4 | Pistol / SMG / Rifle / Marksman |
| G | Throw grenade (throws the selected kind, or the next owned one) |
| E (hold) | Plant / defuse the bomb |
| B | Buy menu |
| Ctrl or C | Crouch |
| Shift | Walk (quiet, accurate) |
| Space | Jump |
| Right mouse | Aim (marksman scope) |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request at runtime: static ES modules under `game/`,
three.js 0.187.0 vendored in `game/vendor/three/`.

## Screenshots

`shots.json` lists the deterministic captures (`?shot=start|play|end&seed=1`).
Each one is a real render of this game's own code in a browser.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the kit's vendored `buildDossier`.

## License

MIT — see `LICENSE`.
