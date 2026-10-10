# RescueMesh — immersive 3D story and simulation

Interactive website for **RescueMesh** by BuildForge (Pragyan, Aryan, Abhirup, Anurup): self-powered drone docks and a decentralized mesh that turn a communication blackout into a working relay network. Built from `RescueMesh_animated.pptx`.

This is a conceptual system and demonstration platform. Terrain is procedural (not a DEM of Kishtwar); all energy, range and cost figures are the deck's assumptions or model outputs, and the simulation is labelled as such everywhere.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

A prebuilt, fully self-contained copy is in `dist-single/index.html` (open it in any modern browser with WebGL 2).

## Stack

React 19 + TypeScript, Three.js r169, GSAP 3.12 + ScrollTrigger, Tailwind CSS 3, Vite 5.

Notes on the brief's stack:
- **React Three Fiber / Drei / Lucide / MapLibre** were not available in the offline build environment (no npm registry access). The 3D layer is written as plain Three.js scene modules (`src/scenes`, `src/models`) mounted by a React `Viewport` component; icons are Lucide paths inlined in `components/ui/Icon.tsx`. The operations map is drawn from the same terrain model as the 3D scenes instead of MapLibre tiles (tiles would also misrepresent a conceptual terrain).
- `scripts/build-offline.mjs` is the esbuild + Tailwind CLI build used to produce `dist-single`.

## Structure

```
src/
  app/            App shell, global actions (Run Demo, scrolling)
  components/     navigation, layout, storytelling (scroll chapters), interactions, dashboard, ui
  scenes/         Story world, station viewer, mission/ops twin, route twin, power system
  models/         Procedural docking station, drone, turbine, solar, battery, antenna, markers…
  simulation/     Single source of truth: store, mesh engine, route planner (Dijkstra + A*),
                  mission engine, power model, failure scenarios
  data/           systemConstants (all tunable assumptions), stations, missions, part info
  utils/          Deterministic terrain height field
```

Every panel (3D mission twin, dashboard, mesh lab, architecture, route planner) reads the same simulation state; `Reset Demo` restores the deterministic starting state.
