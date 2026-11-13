# hakase

A sketchbook for visual/artsy programming, wired together entirely as RxJS
dataflow. Generative sketches render on the GPU from small GLSL formulas, and
everything around them — editors, clocks, signals, sound, notes and planning
tools — lives as windows on one infinite canvas.

The orchestration is the point of the project: every piece of state is a fold
over a stream of actions, every window is a subscription, and the app has one
`.subscribe()`. [AGENTS.md](AGENTS.md) is the full design record.

## Getting started

### With Docker (no local Node needed)

```bash
docker compose up dev --build
```

Hot reload on http://localhost:5173.

| Script                   | What it does                                       |
| ------------------------ | -------------------------------------------------- |
| `npm run docker:dev`     | Dev server with HMR on :5173                       |
| `npm run docker:preview` | Builds and serves through nginx on :8080           |
| `npm run docker:build`   | Exports a production build to `./dist` on the host |

Dependencies live inside the image rather than in a mounted volume, so **after
changing `package.json` the compose services need `--build`** to pick them up —
which the scripts above always pass.

Only `src/`, `index.html` and the two config files are mounted. Mounting the whole
repo would shadow the container's `node_modules` with the host's, and Rolldown and
esbuild ship platform-specific binaries: a macOS `node_modules` will not run on
Linux. If you add a top-level file the build needs, add it to the mount list in
`compose.yaml` too.

### With a local Node

The repo uses Node **24 LTS**, selected by `.nvmrc`:

```bash
nvm use && npm install && npm run dev
```

| Script                            | What it does                                             |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Vite dev server with hot reload on http://localhost:5173 |
| `npm run build`                   | Type-checks, then builds to `dist/`                      |
| `npm run preview`                 | Serves the production build                              |
| `npm run typecheck`               | `tsc --noEmit`                                           |
| `npm run lint` / `lint:fix`       | ESLint (type-aware) and the UI catalogue audit           |
| `npm run format` / `format:check` | Prettier                                                 |
| `npm test`                        | Vitest                                                   |

## What is in it

Windows live on an infinite canvas: drag the ground to pan, pinch or
ctrl/cmd+wheel to zoom, and use the navigator card at the bottom right to
launch programs, jump between painted sections and undo. ⌘K opens a command
palette. Windows snap together, attach, and remember everything; the whole app
is saved as one snapshot and every edit is one undoable log.

- **Make** — sketches, the formula and theme editors, timelines and the playhead
  dial, signals (LFOs and step sequencers), a plot, paint and pen pictures, a voice
  synth and a drum machine, pedals and an Output for chaining pictures, and
  blueprints. Signals can drive a sketch's knobs and camera, draw with a pen, or
  play a voice, all as pure functions of the playhead.
- **Logic** — gates built from NAND, delays, switches, patterns and lamps, boxed
  into components.
- **Convert** — converters that turn one port type into another (an agenda into
  a level, a voice into a bit, a city's day into daylight), each with its
  readings and the modifiers its output type shares.
- **Plan** — tickets (list and board), notes, a focus timer, an agenda, habits,
  world clocks, bookmarks and progress bars.
- **System** — the task manager, history, the state map, appearance and an
  in-app Storybook.

Each window is bound to a named **state**. Two windows on one state share it; a
window can fork its state, switch to another, or follow another window's output
— a sketch's knob following a signal, a progress bar following an agenda. Every
port has a type (level, bit, clock, picture and so on) shown on its jack, and a
converter stands between two types that do not match.

## How it fits together

Everything our code owns is one of four things:

1. **Component** — a custom element with a shadow root. Its whole surface is
   `changes$` out (what the user did) and `connect$(...)` in (state to apply).
2. **Window** — `hks-window`, a component that holds one other component and
   owns only the frame.
3. **Program** — a definition in `src/programs/`: a component, its window, its
   icon and how it connects to app state. The only layer that knows both.
4. **Process** — a running program. A process is a subscription: subscribing
   opens its window, unsubscribing closes it and every listener, animation loop
   and GL context with it.

`main.ts` is only the graph: it folds every window's actions into the documents
log, hands each window its own slice of state back, and subscribes once.

The tree is grouped by component:

- **`components/<name>/`** — the custom element (`*.component.ts`, the only file
  that touches the DOM), its CSS and its pure siblings.
- **`programs/`** — one file per program.
- **`shared/`** — modules with more than one importer, including the UI
  primitives under `shared/ui/`.
- **`lib/`** — primitives underneath everything.

## Writing a formula

A formula is GLSL ES 3.00 defining `vec3 formula(float x, float y, float t)`,
evaluated in the vertex shader once per lattice point. `x` and `y` are in
[-1, 1], `t` is the playhead in [0, 1), and the returned point is a position in
3D space whose `z` is also its depth along the sketch's theme. Keep every use of
`t` inside a term of `t * 2.0 * PI` and the loop is seamless.

```glsl
vec3 formula(float x, float y, float t) {
    float depth = length(vec2(x, y)) / sqrt(2.0);
    float wave = sin(2.0 * (depth + t) * PI);

    return vec3(x, y * ((wave + depth) / 2.0), depth);
}
```

Type into the formula editor and every sketch showing that formula recompiles; a
broken edit shows the compiler's message against your own line numbers while the
sketch keeps drawing the last version that worked. The editor's "How formulas
work" panel covers the rest: knobs `k1`–`k4`, the pointer, a tint, a scripted
`camera()`, custom `lattice()` and `space()` hooks, and `evolve()` for
simulations that keep state from step to step.

A built-in formula is a `.glsl` file, a small module naming it, and one entry in
[`src/components/sketch/formulas/registry.ts`](src/components/sketch/formulas/registry.ts),
which is the single source of truth: a new key becomes an option in every picker.
Formulas you write in the app can be saved to your library and shared as a link.
