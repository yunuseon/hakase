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

## Components

`connect$` means one thing: **connect app state to the UI**. A view takes streams
of state and applies them; anything that derives state belongs in `model/`, or —
when it genuinely needs the GPU — in a named pipeline stage beside the view, not
as a method on it. Every component's whole surface is `changes$` out and
`connect$` in, with no exceptions.

Every view our code owns is a **component**: a custom element with a shadow root,
in a folder of its own under `view/components/<name>/`, holding
`<name>.component.ts` plus `<name>.css` — imported with Vite's `?inline` and
adopted once per module via `adoptedStyleSheets`. Everything under
`view/components/` is a component and nothing else is; `gl/`, `formula.ts`,
`drag.ts` and `controls.ts` sit beside that folder precisely because they are
not. There is
no framework and no second state model — the element is a DOM container, the
streams stay outside it, and `changes$` / `connect$` are unchanged. Tweakpane is
the exception: it builds its own panel, so `controls.ts` stays a plain factory.

The tool is drawn as **windows**: a thin border, a small uppercase title bar, a
padded body. That chrome lives once in `view/components/window.css` and every
component adopts it _before_ its own sheet — `adoptedStyleSheets` takes an array,
so shared chrome and component specifics stay in separate files. A component that
is slotted into another window (`hks-linear-slider`, `hks-fps-counter`) unsets the
frame in its own sheet rather than opting out of the shared one.

`hks-sketch` exposes one slot, `status`, for the fps readout in its title bar.
Slotted children stay in the light DOM, so `main.ts` still finds them with
`requireElement` and their own shadow roots are untouched. Everything else is a
window in its own right — a control that belongs to the sketch conceptually is
not therefore part of its chrome, and the timeline learned that the hard way.

## Windows

Windows drag by their title bar, resize from any edge or corner, and raise on
click. `frameActions$` adds the eight handles itself, so the frame is described
in one place rather than in four templates; they straddle the border by half
their width, so grabbing an edge does not demand pixel accuracy. A west or north
drag moves the window as well as sizing it, and the clamp has to agree — `x`
shifts by the width the minimum actually allowed, or the far edge creeps while
you push against the limit. All of that is one pure reducer All of that is one pure reducer — `reduceLayout` in
`model/layout.ts` — folded over a stream of `LayoutAction`s with `scan`. There is
no `dragging` flag, no `offsetX`, no z-index counter: depth is read from the
stacking order, and the per-gesture `pointerDelta$` in `view/drag.ts` supplies
the deltas. Pairing has to happen _inside_ the gesture; pairing the flattened
stream would make the first move of each drag jump from wherever the last one
ended.

**The sketch's frame _is_ its canvas size.** Its grip emits an ordinary `resize`
like every other window, and `main.ts` reads the canvas dimensions back out of
`frames.sketch`, so the size persists with the rest of the layout and needs no
stream of its own. The one asymmetry: that frame's width and height are never
applied to the element — the window is sized by the canvas it contains, and
`connect$` takes only a `Placement`.

The layout persists to `localStorage`, debounced: a drag emits on every pointer
move and storage only needs where it stopped. That is hygiene, not speed — a
write measures about 2us for a 168-byte payload, so do not go looking for it in a
profile. A stored layout is untrusted input:
`parseLayout` rebuilds it field by field and returns null on anything unexpected,
and `clampToViewport` drags a window that was saved off screen back within reach,
because otherwise there is no way to grab its title bar again.

`viewportSize()` in `lib/dom.ts` is the only place that knows `innerWidth` reads
0 in an embedded frame before first layout. Do not sample the window directly —
a zero viewport seeds every window at the origin with no size, and it silently
disables the clamp above.

`src/styles.css` is page-level only: the palette, `#stage` layout, and where the
floating panels sit. Custom properties cross the shadow boundary, so components
theme themselves from `--backdrop`, `--track`, `--indicator`, `--accent`.

**A panel that can cover a control must be dismissible and closed by default,
and must not take pointer events while closed.** Overlapping the canvas is
harmless; a panel over a slider swallows its `pointerdown` and the control goes
dead with no error anywhere. The Tweakpane pane floats bottom-right, collapsed to
its title bar, and a shut docked terminal sets `pointer-events: none` — both for
this reason.

The floating pane is anchored by `inset-block-end` with `top` auto, so expanding
grows the box upward and it opens away from the edge it is pinned to rather than
off the bottom of the window.

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
- **One owner per value.** The sketch's size belongs to the window grip and the
  panel has no binding for it, so nothing can republish a stale copy. When two
  controls edited it, every unrelated knob snapped the sketch back to the panel's
  number, and the fix was a whole extra field remembering what the panel last
  said. Removing the second owner deleted that field and the bug together.
- **Never let a stream reach a `combineLatest` by two paths.** If A feeds B and
  the pipe combines A and B, every A emission fires twice — once with the stale
  B — and the work downstream doubles silently. Fold the sources into one chain,
  or one `scan` over a union of actions, instead. Both of the app's diamonds
  (`params$` -> `geometry$`, and `controls.sketch$` -> `size$`) were exactly this.
- Prefer a bug that _cannot be expressed_ over a bug that is patched. When a
  stale-value bug shows up, the fix is usually to make the stale thing an input
  to a `combineLatest`, not to cache it and invalidate by hand.
- **Comments must guard a trap, or not exist.** The bar is narrow and it is the
  only bar: _without this line, would someone make a change that looks correct
  and silently breaks something?_ If not, delete it. Not "it explains the
  design", not "it is helpful context", not "it took a while to work out" —
  those belong in this file, where they are read once, rather than beside code
  where they are read forever.

    Assume the reader can read. Names, types and structure already say what the
    code does; a comment that restates them is noise, and a pipeline that needs
    prose to be followed should be restructured instead. Whole-file and
    every-export doc blocks are the usual way this creeps back in — do not write
    them.

    A comment that earns its place is **one line**, sits on the exact statement it
    guards, and names the wrong change it is preventing: `// Not api.dispose() —
that tears the row out of the panel.` If it needs a paragraph, the paragraph
    goes here and the code gets a sentence.

    Twenty-two of them survive in `src/` today, every one a single line. Treat that
    as the ceiling, not the target: adding one means arguing it past the bar, and
    finding two that describe rather than warn means deleting them.

## The formula editor

The editor is the same contract as a slider: `changes$` out (debounced text),
`connect$` in (preset text to display, error text to show). It deliberately never
echoes the user's own typing back into the textarea — only preset selections —
because writing the value back would reset the caret on every keystroke.

The terminal has two styles, and the names follow the desktop convention rather
than the other way round: **`docked`** is pinned to the top edge and slides away
(Quake-style), **`floating`** is an ordinary window among the others. Getting
this backwards makes the button lie — a button that says what it will do reads
as inverted the moment the styles are misnamed.

The button in its title bar switches them, and so do the shortcuts: `alt+t` shows
and hides a docked panel, `alt+d` docks and undocks, `esc` closes. They are
matched on `event.code`, not `event.key` — Alt+T reports `†` on macOS, and an
earlier backquote binding was a dead key reported as `Dead` on a German layout,
so matching the character means a shortcut that silently does nothing. Avoid
browser-claimed combinations (`ctrl/cmd` + `j`/`k`/`d`/`l`) and function keys,
which laptops hide behind `Fn`.

Docking always opens the panel: arriving docked with it shut looks like the
terminal vanished. Both styles are the _same_ component; only `data-style` and
the `open` attribute differ, applied by `connect$` from a `TerminalState`. The
button label and the shortcut hint both come from `dockLabel`, so they cannot
drift apart. A shut docked panel sets `pointer-events: none`, because an
invisible panel lying over the controls swallows their `pointerdown`.

Compilation is the middle stage of `inputs -> formula -> render`, so it is a free
function — `compileFormula$(gl, source$)` in `view/sketch/formula.ts` — and not a
method on the canvas element. It _produces_ app state rather than displaying it,
which is the line: `connect$` connects app state to the UI, and anything that
derives state instead is a pipeline stage. The element owns the canvas and
exposes its `gl` for the stage to compile into. Failure is a value, not an
exception. `main.ts` splits the outcome: successes feed `sketch$`, failures
feed `error$`. Because a failure means `sketch$` simply does not emit,
`combineLatest` keeps the last shader that linked and the canvas never blanks.
Preserve that property. `connect$` also deletes each superseded `WebGLProgram`
once a newer one has replaced it, so editing does not leak GPU resources — that
cleanup belongs inside `connect$` rather than in a method of its own, because a
view's whole public surface is `changes$` out and `connect$` in.

The textarea is highlighted by painting a Prism-tokenised `<pre>` behind it and
making the textarea's own text transparent. That keeps a real `<textarea>`, so
the caret, native undo, IME and accessibility all still work, and `changes$`
stays a plain `input` event. The price is that **both layers must lay text out
identically** — font, line-height, padding, border, wrap — or the caret drifts
away from the glyphs. Change a text metric on one and you must change the other.
Highlighting is driven by the raw `input` stream so it repaints per keystroke,
while compilation is debounced; do not merge those two.

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
It also **freezes CSS transitions mid-flight**, so `getComputedStyle` keeps
reporting the pre-transition value. Anything driven by frames, resizes or
transitions will look broken there, and a transitioned property can read as the
exact opposite of what the CSS says. Force a frame with a screenshot, then read
the DOM — do not conclude the app is broken from a timing-based probe alone.
