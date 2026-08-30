# hakase

A small sketchbook for visual/artsy programming: a GPU-rendered sketch whose _playhead_
you can scrub with a linear or a circular slider, or let loop on a timer. Every
parameter is live-editable through a [Tweakpane](https://tweakpane.github.io/docs/)
panel, and the whole thing is wired together with RxJS streams.

The sketch that ships with it is a radial ripple — a lattice of dots displaced by
a sine wave travelling outwards from the centre.

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

## How it fits together

Everything is a stream, and `main.ts` is only the graph:

```ts
merge(
    linearSlider.connect$(playhead$),
    circularSlider.connect$(playhead$),
    sketch.connect$(controls.sketch$, playhead$),
    fpsCounter.connect$(playhead$),
).subscribe();
```

Three layers, one rule — a view never derives, a model never touches the DOM:

- **`model/`** is pure: the playhead, slider geometry, and the GLSL source of
  each formula. No DOM and no GPU anywhere in it.
- **`view/`** owns DOM and exposes `connect$(...inputs) => Observable<void>` —
  streams in, applied views out. Sliders additionally expose `changes$` as a
  source. Every view has that same shape, so `main.ts` treats them alike.
- **`lib/`** holds the primitives the other two share: `dom`, `math`, `rx`.

`playhead.ts` owns the only real logic: a scrub sets the position directly; a
non-zero loop `duration` advances it every animation frame from wherever the last
scrub left off.

## Adding a formula

A _formula_ is the pure function that displaces the lattice — it is what the
`formula` dropdown in the panel selects. Adding one is a single edit to
[`src/model/formulas/registry.ts`](src/model/formulas/registry.ts):

```ts
export const formulas = {
    ripple: { label: 'Ripple', apply: rippleAt },
    swirl: { label: 'Swirl', apply: swirlAt },
} satisfies Record<string, { label: string; apply: Formula }>;
```

That registry is the single source of truth. `FormulaName` is `keyof typeof
formulas`, so the new key immediately becomes a legal value of
`SketchParams.formula`, the dropdown builds its options from the labels, and
the view compiles it into the vertex shader. Nothing else needs touching.

A formula is GLSL ES 3.00 defining `vec3 formula(float x, float y, float t)`,
where `x` and `y` are normalized to [-1, 1] and `t` is the playhead in [0, 1).
The returned `x`/`y` are clip-space position and `z` is depth, which drives both
point size and colour. `PI` is predefined.

```glsl
vec3 formula(float x, float y, float t) {
    float depth = length(vec2(x, y)) / sqrt(2.0);
    float wave = sin(2.0 * (depth + t) * PI);

    return vec3(x, y * ((wave + depth) / 2.0), depth);
}
```

Write it in a `.glsl` file beside `ripple.glsl` and import it with `?raw`. The
formula is _data_ — a string in the model layer — and the view splices it onto
`view/gl/shaders/sketch.vert` and compiles it. That is what will let formulas be
authored at runtime.
