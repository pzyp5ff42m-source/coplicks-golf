# Coplicks Golf · Front 9

A 3D browser golf game of the front nine (holes 1–9) at Coplicks
(Tallebudgera Golf Club, Gold Coast). The terrain uses real LiDAR elevation
and the course shapes come from OpenStreetMap. It works on phones and desktops.

Play it here: https://pzyp5ff42m-source.github.io/coplicks-golf/front9/

## Folder layout

```
front9/
├── index.html          page markup (HUD, overlays, settings)
├── style.css           all styling
├── app.js              built bundle (generated – do not edit)
├── build.mjs           esbuild script: src/main.js → app.js
├── package.json
└── src/
    ├── main.js         entry point and render loop
    ├── state.js        shared mutable game state (one `game` object)
    ├── config.js       settings, device detection, quality tiers, difficulty presets
    ├── renderer.js     three.js renderer, scene, camera, bloom
    ├── geometry.js     polygon helpers and outline smoothing (Chaikin, Douglas–Peucker, untangle)
    ├── course.js       elevation sampling and smoothing, course outlines, current hole, bunkers
    ├── lighting.js     sun, sky, fog
    ├── materials.js    procedural textures and turf shader (stripes, soft dithered edges)
    ├── scenery.js      terrain, fairways, tees, greens, bunkers, water, cart paths
    ├── vegetation.js   trees, bushes, grass tufts and the tree collision grid
    ├── props.js        pin, cup, flag, tee markers, clouds, birds, wind particles
    ├── audio.js        sound effects made with Web Audio (no sound files)
    ├── physics.js      clubs, lies, wind, ball flight, roll and tree hits
    ├── player.js       ball, club selection and launch maths
    ├── preview.js      aim arc, tracer, landing ring, putting grid
    ├── camera.js       orbit, flyover, aim, chase, landing and replay cameras
    ├── holes.js        loading a hole and running totals
    ├── game.js         shot flow, hole-out, replay, starting holes and rounds
    ├── scorecard.js    9-hole scorecard and best scores for each difficulty
    ├── swing.js        3-tap swing meter and touch, mouse and keyboard input
    ├── ui.js           HUD, toasts, club picker, settings, start screen
    ├── competition.js  competition mode: lobby, invites, rules, round flow, in-round hooks
    ├── leaderboard.js  competition storage (textdb.dev), formats, scoring, standings, plausibility checks
    ├── debug.js        window.G test hooks (only with ?debug=1)
    └── data/
        ├── course.json     OSM outlines plus front-9 hole data (par, metres, tee/green, routing)
        └── elevation.json  2 m elevation grid from 1 m LiDAR (heights in metres)
```

Each module imports only what it needs. Values that several modules
reassign, such as the game state, strokes, aim, difficulty, camera mode and
scores, are kept on the single `game` object in `state.js`.

## Build and run

```bash
npm install
npm run build        # writes app.js
npm run serve        # or any static file server, then open http://localhost:3000
```

`npm run watch` rebuilds automatically while you edit. `index.html` loads
`app.js` as a normal script, so the built game also runs straight from the file
system.

## Competition mode

Open **🏆 Competitions** on the start screen to create an invite-only event
or to join one.

- **Create:** enter a name and pick a difficulty that everyone will play on.
  You then get:
  - an **invite link** (`…/front9/?c=<code>`) to share with players
  - a private **admin link** (`…&admin=<admin code>`) for removing players
    from any device
- **Join:** open the invite link, or type the code, then enter a player name.
  The player identity is kept on that device in localStorage.
- **Rounds:** each player plays the four rounds in order, in their own time.
  The rules for each format are shown before its round starts.

| Round | Format | Holes | Ranking |
|---|---|---|---|
| 1 | Stroke play | 1–9 | lowest total |
| 2 | Stableford | 1–9 | most points; handicap = ¾ × (R1 − 34), 0–18, given by stroke index |
| 3 | Match play vs par | 1–9 | holes won minus holes lost; ties go to fewest strokes |
| 4 | Skills challenge | 3, 4, 7 | closest to the pin on 3 and 7 (combined metres) plus longest drive on 4 (fairway only); ranked separately and averaged |

Overall standings add up place points from each round: 25-18-15-12-10-8-6-4-2-1.
Tied players share the better place.

**Storage:** [textdb.dev](https://textdb.dev) is free, needs no accounts and
allows cross-origin requests. Each competition and each player has its own
JSON document (see `leaderboard.js`). Only someone with the code can find a
competition's documents.

**Light anti-cheat:**
- Each hole is saved the moment it's finished and can't be changed later, so
  there is one submission per hole and per round.
- Players can quit and resume, but they can't replay a hole they've finished.
- Rounds unlock in order.
- Standings are recalculated from the raw scores.
- Rounds with impossible values (scores outside 1 to par+6, drives over 330 m)
  or holes finished less than 4 s apart are shown as "not counted".

These checks run in the browser. A determined player with the code could still
edit the stored data, so this suits friendly competitions only.

## URL options

- `?q=low|med|high` forces a graphics quality level. The default is auto, which
  steps down if the frame rate drops.
- `?c=<code>` opens a competition; `&admin=<code>` unlocks the admin tools.
- `?debug=1` adds `window.G` hooks for automated testing.

## Data sources

- Par and metres for each hole come from the club's course map.
- Outlines for tees, greens, fairways, bunkers and water are from OpenStreetMap.
  The Hole 1 fairway bunker was added for gameplay.
- Elevation is from a public 1 m LiDAR elevation model. It is resampled to
  a 2 m grid and lightly smoothed in `course.js`. In-game heights are
  exaggerated 2.5× so the slopes are easier to see.
