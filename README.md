# hakase

A small sketchbook for visual/artsy programming: a canvas sketch whose _playhead_
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

Everything is a stream. `main.ts` wires four of them together:

```
slider drags ──┐
               ├─► playhead$ ─┬─► slider.render()   (both sliders follow the playhead)
timeline$ ─────┘              ├─► fps counter
                              └─► combineLatest(sketch params) ─► renderSketch()
```

- **`playhead.ts`** owns the only piece of real logic: a scrub sets the position
  directly; a non-zero loop `duration` advances it every animation frame from
  wherever the last scrub left off.
- **`ui/`** holds the DOM-facing pieces. Both sliders expose the same `Slider`
  interface — a `changes$` stream out, a `render(value)` in — so the playhead
  neither knows nor cares how many controls are attached.
- **`sketch/`** is pure drawing: `canvas.ts` keeps the backing store in sync with
  the device pixel ratio so the rest of the code can work in CSS pixels, and
  `render.ts` draws one frame from `(params, playhead)`.

## Adding a sketch

`renderSketch(context, params, playhead)` in [`src/sketch/render.ts`](src/sketch/render.ts)
is the only thing that draws. Swap its body, add whatever knobs you want to
[`src/sketch/params.ts`](src/sketch/params.ts), and expose them in
[`src/ui/controls.ts`](src/ui/controls.ts).
