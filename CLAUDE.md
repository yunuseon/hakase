# hakase — working agreement

## What this project is for

A side project for visual/artsy programming. It is **not** trying to ship
features. Two things are being explored, and they rank above delivery speed,
brevity, and feature count:

1. **The orchestration logic, expressed purely in reactive functional style.**
   This is the point of the project. The sketch on screen is the excuse.
2. Generative graphics as the subject matter, rendered on the GPU.

If a change would make the app better but the orchestration less reactive, that
is a bad trade here. Say so and propose the reactive version instead.

## Rendering

The sketch renders with **WebGL2**, not canvas2d. A formula is GLSL, the lattice
loop is the vertex shader, and `gl_VertexID` derives each cell's coordinates —
there are no vertex buffers at all, just one `drawArrays(POINTS, ...)`. This is
worth 40x at `dimension: 128` (0.96ms against 38.4ms) and makes a million points
viable, so do not reintroduce a CPU-side draw loop.

**Shaders live in their own files**, never in template literals: `.vert`/`.frag`
for complete stages under `view/gl/shaders/`, `.glsl` for a formula body under
`model/formulas/`. They are pulled in with Vite's built-in `?raw` suffix, whose
`string` type comes from `vite/client` — no plugin and no cast. `sketch.vert`
declares a `vec3 formula(...)` prototype and the selected formula's definition
is concatenated after it, so the shader file stays valid on its own and the
splice is a plain string append with no placeholder token.

## Layering

Three layers, one rule: **a view never derives, a model never touches the DOM.**

- **`src/model/`** — pure functions and stream derivations. No DOM, no
  rendering, no GPU. `playhead`, `slider` maths, param types, and the GLSL
  source of each formula (shader text is data).
  Testable by calling them.
- **`src/view/`** — owns a piece of DOM and exposes
  `connect$(...inputs) => Observable<void>`: streams in, applied views out. It may
  also expose raw sources (`Slider.changes$`), but the derivation behind them
  belongs to a model function. Every view has the same shape — sliders, sketch,
  fps counter, control panel.
- **`src/main.ts`** — the graph and nothing else. Construct views, derive
  `playhead$`, `merge` the connections, subscribe once. No `tap`, no DOM, no
  GL imports. If something view-shaped is creeping into `main.ts`, it wants
  to be a view.

`src/lib/` sits underneath all three: `dom`, `math`, `rx` primitives.

## The prime directive

**All orchestration is declarative dataflow.** State lives in streams, not in
variables. Concretely, everywhere in `src/`:

- **No mutable `let` for application state.** If something has to be remembered
  between events, that is a stream with `scan`, `distinctUntilChanged`,
  `combineLatest`, or `withLatestFrom` — not a captured variable.
- **No `Subject` / `BehaviorSubject` as an event bus.** Adapt external event
  sources with `fromEvent` / `fromEventPattern` / `new Observable`, with real
  teardown. A Subject is Rx's imperative escape hatch; reaching for one is a
  signal the dataflow has not been modelled yet.
- **One `.subscribe()`, at the edge.** Everything above it is a description of
  what should happen, not a sequence of things happening. Multiple subscribers
  to one source is fine; multiple entry points into the app is not.
- **Side effects go in `tap`, at the end of a pipe**, and only ever _apply_ a
  value that a pure function already computed. Deriving a value inside a `tap`
  is the smell.
- **Pure functions carry the logic.** `offsetFor(geometry, value)`,
  `valueAt(clientX, ...)`, `parseHexColor(hex)` — data in,
  data out, independently testable. The stream decides _when_; the function
  decides _what_.

### Where this does not apply

The lattice loop now lives in the vertex shader, not in TypeScript, so the old
carve-out for it is gone. If a tight numeric loop ever comes back, local `let`
counters inside a pure function are fine — the rule is about orchestration, not
about banning loops.

### The design tension to be aware of

There is a **feedback cycle** in the app: sliders emit values → the playhead
consumes them → the sliders display the playhead. It is currently cut by having
each slider expose `changes$` (a source) and `connect(playhead$)` (a view), with
whoever wires them owning the loop. A slider must never reach for the current
value itself. If you find a cleaner way to close the cycle, that is a welcome
change — it is the most interesting open problem here.

## Type safety

**No type assertions in `src/`.** No `as`, no `!`, no `any`, and no explicit type
argument that the compiler cannot check — `fromEvent<PointerEvent>(el, 'x')` is a
cast wearing a costume. The count is currently zero; keep it there.

When a value needs narrowing, narrow it at runtime (`instanceof`) rather than
asserting it. When an external source needs adapting, reach for
`new Observable<T>(subscriber => ...)`: the callback body type-checks against `T`,
so the emitted type is verified rather than declared. All three adapters in the
app work this way — `fromElementEvent$`, `observeResize$`, and `bind$` in
`controls.ts`.

**No phantom type parameters.** A `<T>` that appears only in a function's return
type — or in the parameters of a function it returns — has nothing to be inferred
from at the call site. TypeScript falls back to `unknown` on a good day and `any`
on a bad one, and `no-unsafe-call` starts firing. `reportFps$` took `<T>` this way
and now simply takes `Observable<unknown>`, because counting emissions does not
care about their type.

**Equality is exact.** No generic structural comparison — it is untyped, it walks
string keys, and it silently keeps comparing after someone adds a field. Prefer
deduplicating on the value you actually apply: both sliders `map` to the finished
CSS string and then use a bare `distinctUntilChanged()`, so `===` on a string
matches precisely when the DOM write would be identical. Where a record genuinely
must be compared, write a named comparator next to it that names every field —
`sameGeometry` in `view/sketch.ts` is the only one.

## Conventions

- **`$` marks everything in the stream domain.** Streams, parameters and
  interface members holding one, functions returning one, and operator functions
  meant for `.pipe()`: `playhead$`, `geometry$`, `scrubs$`, `changes$`,
  `createPlayhead$`, `observeResize$`, `pointerDrag$`, `bind$`, `Slider.connect$`,
  `reportFps$`, `toVoid$`, `shareLatest$`.
- **Nothing outside that domain gets it.** `createLinearSlider`, `createSurface`
  and `createControls` return plain objects; `clamp`, `wrap01`, `shallowEqual`,
  `offsetFor` and `parseHexColor` are pure helpers.
- **No thin wrappers over RxJS.** If a helper only renames an operator or fixes
  its arguments — `toVoid$ = map(() => undefined)`, `shareLatest$ = () =>
shareReplay({...})` — write the operator at the call site instead. It costs a
  line, and it keeps `lib/rx.ts` to things that genuinely add something: adapters
  over non-Rx sources (`fromElementEvent$`, `observeResize$`), streams with real
  behaviour (`devicePixelRatio$`), and pure predicates (`shallowEqual`).
- **No barrel files.** No `index.ts` re-exporting a folder; name a module for
  what it contains (`formulas/registry.ts`). Two ESLint rules enforce it — one
  errors on any `index.*` module, the other on any import ending in `index`. This
  is not expressible in `tsconfig.json`; TypeScript has no such option.
- **Do not shadow an RxJS export.** `shareLatest$` is deliberately not named
  `multicast` — RxJS exports an operator by that name, and a reader who knows it
  would misread ours.
- Prefer a bug that _cannot be expressed_ over a bug that is patched. When a
  stale-value bug shows up, the fix is usually to make the stale thing an input
  to a `combineLatest`, not to cache it and invalidate by hand.
- **Comments must guard a trap, or not exist.** The bar: without this comment,
  would someone make a change that looks correct and silently breaks? If not,
  delete it. Documenting what a function does is not a trap — names and types
  carry that, and a pipeline needing prose to be followed should be restructured
  instead. Exactly three pass in `src/` today: the Tweakpane teardown in
  `controls.ts`, the `defer` self-reference in `rx.ts`, and `geometry$` gating the
  redraw in `view/sketch.ts`. Keep the count that low.

## Adding a formula

The `Formula` contract lives in `src/model/formula.ts`, one level above the
implementations, so a formula can annotate itself without importing the registry
that imports it. `src/model/formulas/registry.ts` is the single source of truth for selectable sketch
functions: one entry carries the key, the label, and the function. `FormulaName`
is `keyof typeof formulas`, so an entry automatically becomes a legal
`SketchParams.formula`, a dropdown option, and a shader the view can build. Do not add a
parallel list of names or labels anywhere — that is the thing this shape exists
to prevent.

## Tooling

- Node **20.19+**. Do not assume the host has it — `nvm use` reads `.nvmrc`, and
  Docker is the fallback that needs no local Node at all.
- `docker compose up dev --build` for the dev server; `npm run docker:build`
  exports `dist/` via a BuildKit `--output` stage.
- **Prefer conventional, idiomatic setups over clever ones.** An unusual
  arrangement will be questioned and should be justified or dropped. If the
  ecosystem has a standard way to do something, use it.
- Before reporting done: `npm run typecheck`, `npm run lint`, `npm run format`.

## Verifying UI changes

The app must actually be looked at, not just compiled. Note that an embedded /
hidden browser pane reports `document.hidden === true`, which **throttles
`requestAnimationFrame` and suppresses `ResizeObserver` delivery entirely**.
Anything driven by frames or resizes will look broken there. Force a frame with
a screenshot, then read the DOM — do not conclude the app is broken from a
timing-based probe alone.
