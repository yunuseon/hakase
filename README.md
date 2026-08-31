# hakase

A small sketchbook for visual/artsy programming: a GPU-rendered sketch whose _playhead_
you can scrub with a linear or a circular slider, or let loop on a timer. Every
parameter is live-editable through a [Tweakpane](https://tweakpane.github.io/docs/)
panel, and the whole thing is wired together with RxJS streams.

It ships with five formulas — **Ripple**, **Spiral**, **Interference**, **Weave**
and **Rose** — each a lattice of dots displaced by a pure GLSL function of
position and time, picked from the editor and editable live.

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

Requires Node **20.19+** (or 22+). The repo ships an `.nvmrc`:

```bash
nvm use && npm install && npm run dev
```

| Script                            | What it does                                             |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Vite dev server with hot reload on http://localhost:5173 |
| `npm run build`                   | Type-checks, then builds to `dist/`                      |
| `npm run preview`                 | Serves the production build                              |
| `npm run typecheck`               | `tsc --noEmit`                                           |
| `npm run lint` / `lint:fix`       | ESLint (type-aware)                                      |
| `npm run format` / `format:check` | Prettier                                                 |

The windows drag by their title bar, resize by their corner grip, raise on click,
and remember where you left them. Resizing the sketch window resizes the sketch — that is the only way to set its size, so there are no width/height controls in the panel.

The interface is laid out as a small desktop tool: thin-bordered windows for the
formula editor, the sketch and the playhead dial, with the parameter pane
floating collapsed in the corner. The canvas is the subject — everything else is
chrome around it.

## How it fits together

Everything is a stream, and `main.ts` is only the graph:

```ts
const programs = [formulaProgram, sketchProgram, timelineProgram, playheadProgram];
```

Each of those is a **program**: a definition pairing one component with the window
that holds it and its dock icon. A running instance is a **process**, and a
process's whole existence is a subscription — mounted when it is opened, removed when it is
closed. `main.ts` builds the streams they read back and subscribes once.

The tree is grouped by component, not by layer, so one folder holds everything
only that component needs:

- **`programs/`** — one file per program, pairing a component with the window that
  holds it. The only layer that knows about both; imports only ever point down
  into `components/`, never the other way.
- **`components/<name>/`** — the custom element (`*.component.ts`, the only file
  that touches the DOM), its CSS adopted into a shadow root
  and its pure siblings. `components/sketch/` owns its own
  `gl/`, `shaders/` and `formulas/`, because nothing else imports them.
- **`shared/`** — the modules with more than one importer: the pointer-drag
  gesture and the playhead model.
- **`lib/`** — primitives underneath everything: `dom`, `math`, `rx`, `color`,
  `storage`.

One rule survives the flattening: a component never derives, a pure module never
touches the DOM. Every component exposes `connect$(...inputs) => Observable<void>`
— streams in, applied views out — and sliders additionally expose `changes$` as a
source, so `main.ts` treats them all alike.

`shared/playhead.ts` owns the only real logic: a scrub sets the position directly; a
non-zero loop `duration` advances it every animation frame from wherever the last
scrub left off.

## Writing a formula

The formula editor is a live GLSL editor with syntax highlighting, in an ordinary
window like every other. Type into it and the shader is
recompiled (debounced); the sketch updates without a reload. A formula that does
not compile shows the driver's message with **line numbers rebased onto your own
text**, and the canvas keeps drawing the last one that worked rather than going
blank. Its preset picker seeds the source with a built-in formula.

Each sketch window carries its own **parameters** strip — which formula it
renders, which theme colours it, plus lattice, dot size and depth — so two
sketches can show different formulas, or the same one at different densities.

A **theme** is a gradient of one or more colour stops, edited in its own program:
drag a stop's position, pick its colour, add or drop stops, and choose whether the
colours blend smoothly or hold as hard bands with no interpolation at all. Themes
are shared like formulas — retheme `ember` and every sketch wearing it repaints. The formula text itself is shared: edit Rose in an editor and every
sketch showing Rose updates — as does any other editor open on Rose — while
everything else carries on untouched. The floating pane at the bottom right holds only
what is global to the app: the loop duration.

## Adding a formula

A _formula_ is the pure GLSL function that displaces the lattice. It is a
`.glsl` file next to a one-line module naming it, and one entry in
[`src/components/sketch/formulas/registry.ts`](src/components/sketch/formulas/registry.ts):

```ts
export const formulas = {
    ripple,
    spiral,
    interference,
    weave,
    rose,
} satisfies Record<string, Formula>;
```

That registry is the single source of truth. `FormulaName` is `keyof typeof
formulas`, so a new key immediately becomes an option in the editor's picker and
a shader the sketch can compile. Nothing else needs touching.

A formula is GLSL ES 3.00 defining `vec3 formula(float x, float y, float t)`,
where `x` and `y` are the lattice cell centres in [-1, 1) and `t` is the playhead
in [0, 1). The returned `x`/`y` are clip-space position and `z` is depth, which
drives both point size and which of the three palette colours is used. `PI` is
predefined. Keep every use of `t` inside a term of `t * 2.0 * PI` and the loop is
seamless.

```glsl
vec3 formula(float x, float y, float t) {
    float depth = length(vec2(x, y)) / sqrt(2.0);
    float wave = sin(2.0 * (depth + t) * PI);

    return vec3(x, y * ((wave + depth) / 2.0), depth);
}
```

Write it in a `.glsl` file beside `ripple.glsl` and import it with `?raw`. The
formula is _data_ — a string in the model layer — and the view splices it onto
`components/sketch/gl/shaders/sketch.vert` and compiles it. That is what will let formulas be
authored at runtime.
