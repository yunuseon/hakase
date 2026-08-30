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
for complete stages under `components/sketch/gl/shaders/`, `.glsl` for a formula
body under `components/sketch/formulas/`. They are pulled in with Vite's built-in `?raw` suffix, whose
`string` type comes from `vite/client` — no plugin and no cast. `sketch.vert`
declares a `vec3 formula(...)` prototype and the selected formula's definition
is concatenated after it, so the shader file stays valid on its own and the
splice is a plain string append with no placeholder token.

## The four layers

Everything our code owns is one of exactly four things, and the whole point is
that the first two never learn about each other:

1. **Component** — a custom element with a shadow root that owns a piece of DOM.
   It knows nothing about windows, about where it sits, or about what else exists.
2. **Window** — a component whose content is another component. It owns the frame
   (title bar, drag, the eight resize handles) and knows nothing about what it
   holds.
3. **Program** — a _definition_: one component paired with the window that holds
   it, its dock icon, and how it connects to `AppState`. This is the only layer
   allowed to know about both, and it is where composition lives:
   `sketch.program.ts` puts the fps counter in the sketch's `status` slot, which
   is a decision neither component could make.
4. **Process** — a _running instance_ of a program. A program is inert data; a
   process is a live subscription. `liveProcess$` is the whole of it: subscribing
   calls `program.launch()`, opens a window around the result and starts it;
   unsubscribing closes the window and takes every listener, rAF loop and GL
   context with it.

**A program may have many processes at once**, so nothing about a program can be a
singleton:

- `Program.launch()` is a **factory**, not an element. Two processes need two
  elements, and one element cannot be in two windows. A module-level
  `export const sketch = new HksSketch()` is exactly the bug this shape prevents.
- State keyed by `ProgramId` would collide, so `Desktop` is keyed by `ProcessId`,
  built from a counter kept _in_ the state so a relaunch never reuses a dead id.
  Its `processes` array is ordered back to front, so a process's **index is its
  z-order** and `raise` is a reorder — there is no z-index counter anywhere.
- Global state cannot be fed by naming instances, because which instances exist
  changes at runtime. Each process instead emits `AppInput`s — `scrub`,
  `transport`, `source`, `diagnostic` — and `main.ts` folds whatever the running
  set happens to produce. That is why two editors drive the same formula and two
  sketches follow the same playhead.
- What genuinely is per-process stays per-process: a sketch compiles `source$`
  into **its own** GL context, so `compiled$` lives in `sketch.program.ts` and
  never in `AppState`.

**Launching is one action from two places.** The dock and the desktop shortcuts
both emit a program id; `main.ts` turns it into a single `launch` action carrying
that program's default `size`, and the reducer cascades each new window by
`launched % 8` so instance two does not land exactly on instance one. Quitting is
the window's own close button — ordinary chrome on every window, not a
per-program affordance.

Programs live in `src/programs/<name>.program.ts` and nowhere else. A component
folder that grows a file naming a window is the mistake this layer exists to
prevent — that file is a program, and it belongs one level up.

**The dependency arrow only ever points down.** Nothing under `components/` may
import `program.ts`, `layout.ts`, `live-window.ts` or `controls.ts`; the check is
one grep and it is worth running. This is why `HksWindow` emits an untagged
`WindowGesture` rather than a `LayoutAction`: the window does not know which
program it holds, so `liveProcess$` — which is program-layer, at `src/` root — is
what stamps the `id` on. `LayoutAction` is literally `WindowGesture & { id }`.

It is also why the old `layout.ts` had to be cut in two. Frame maths (`moved`,
`resized`, `clampFrame`, `frameFrom`) is program-agnostic and lives in
`components/window/frame.ts`; the app's actual layout — `Layout` keyed by
`ProgramId`, `defaultLayout`'s hardcoded four windows, `parseLayout`'s schema —
is app configuration and lives in `src/layout.ts`. If you find yourself adding a
`ProgramId` to something under `components/`, that thing is in the wrong folder.

## Components

`connect$` means one thing: **connect app state to the UI**. A view takes streams
of state and applies them; anything that derives state belongs in a pure sibling
module, or — when it genuinely needs the GPU — in a named pipeline stage beside
the component, not as a method on it. Every component's whole surface is `changes$` out and
`connect$` in, with no exceptions.

Every view our code owns is a **component**: a custom element with a shadow root,
in a folder of its own under `components/<name>/`, holding `<name>.component.ts`
plus `<name>.css` — imported with Vite's `?inline` and adopted once per module via
`adoptedStyleSheets`. There is no framework and no second state model — the
element is a DOM container, the streams stay outside it. Tweakpane is the
exception: it builds its own panel, so `controls.ts` stays a plain factory.

**A component folder holds everything only that component needs**, whatever layer
it belongs to: `components/sketch/` owns its `gl/`, its `shaders/`, its
`formulas/` and its compile stage, because nothing else imports them. Only three
modules are genuinely shared — `lib/`, `shared/params.ts` and `shared/drag.ts` —
and a module earns `shared/` by having a second importer, not by being general in
spirit. If you reach into another component's folder, either the thing you want
belongs in `shared/`, or the two components want to be one.

**A window is a component that holds one other component.** `hks-window` owns the
frame — title bar, drag, the eight resize handles — and knows
nothing about what it contains; the content component owns no chrome and does not
know it is in a window. Keep that line: the moment a content component reaches
for its own title bar or placement, the two are welded together again and neither
can be reused. A window's inputs are a `WindowView`: a frame plus a `kind`, either
`floating` (positioned and sized by its frame) or `fitted` (positioned by its
frame but sized by its content, which the sketch needs because its frame holds
canvas dimensions).

**Every window is the same window.** There is no per-window chrome, no mode, and
no window that another one has to be special-cased around. A feature that only
one window can use — the terminal's docking was one — buys a branch in
`WindowView`, a branch in `connect$`, a button in the shared title bar, a state
reducer, a keyboard map and an `AppState` field, all to serve a single window. If the
next such feature is worth that, it is worth making it work for every window.

**Nothing is declared in `index.html`** beyond the script tag, and no window is
mounted by hand. `main.ts` holds nothing but the list of programs, and a window's
existence is
a subscription: `liveProcess$` creates the `hks-window` in a `defer` factory and
removes it in `finalize`, with its views merged in as `ignoreElements` side
pipelines so one subscription both drives the DOM and reports back. Launching and
quitting is therefore just
`switchMap(running => running ? liveProcess$(...) : EMPTY)` over `processes$`,
which the dock folds from its own clicks. Adding a program is one entry in the
table; nothing else in `main.ts` names it.

**The dock is chrome, not a program.** It lists every program and lights the ones
with a process, so it must not itself be launchable — it is mounted once by
`main.ts` beside the Tweakpane panel. Its tiles are built with
`createElementNS`, never `innerHTML`: a `Program.icon` is path data on a 24x24
viewBox, so an icon can never be markup. And it takes `string`s out and back in,
narrowed by `isProgramId`, because a component may not know what a `ProgramId`
is.

Do not "improve" this by mounting eagerly and hiding closed windows with CSS.
The point is that a closed window holds no subscriptions at all — no `rAF` loop,
no listeners, no GL draws — which a `display: none` window would.

**The graph has a cycle and it is closed by ordering, not a `Subject`.** Windows
emit the layout actions that produce their own frames: `actions$` carries
`LayoutAction`s out of every open window, `layout$` folds them, and `AppState` hands
the frames back in. Two things make it safe, and both are load-bearing:

- A program's `connect$` is a **function of `AppState`**, called from inside
  `switchMap` — long after `state` is initialised. Storing finished streams in
  the table instead would evaluate the cycle at construction time.
- `startWith(seed)` sits **before** `shareReplay`, so the seed is in the replay
  buffer before the source is subscribed and the windows mount. A window that
  subscribes to `layout$` while mounting reads the seed rather than hanging.

The tool is drawn as **windows**: a thin border, a small uppercase title bar, a
padded body. That chrome lives once in `components/window/window.css` and every
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
click. `HksWindow` adds the eight handles itself, so the frame is described
in one place rather than in four templates; they straddle the border by half
their width, so grabbing an edge does not demand pixel accuracy. A west or north
drag moves the window as well as sizing it, and the clamp has to agree — `x`
shifts by the width the minimum actually allowed, or the far edge creeps while
you push against the limit. All of that is one pure reducer — `reduceLayout` in
`layout.ts` — folded over a stream of `LayoutAction`s with `scan`. There is
no `dragging` flag, no `offsetX`, no z-index counter: depth is read from the
stacking order, and the per-gesture `pointerDelta$` in `shared/drag.ts` supplies
the deltas. Pairing has to happen _inside_ the gesture; pairing the flattened
stream would make the first move of each drag jump from wherever the last one
ended.

**A gesture starts on the element and ends on the document.** `pointerdown` is
the element's, but the moves and the `pointerup`/`pointercancel` that close it are
the document's, filtered by `pointerId`. `setPointerCapture` is an optimisation,
not the mechanism — it is wrapped in a `try`, so if it ever fails and the ends are
watched on the element, the release lands somewhere else, `takeUntil` never fires
and the gesture stays open forever. The window then resizes on hover the next time
you cross that border, with no button held. Do not move those listeners back.

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
its title bar, for this reason.

The floating pane is anchored by `inset-block-end` with `top` auto, so expanding
grows the box upward and it opens away from the edge it is pinned to rather than
off the bottom of the window.

## Layering

One rule, and the folders no longer carry it: **a view never derives, a model
never touches the DOM.** The tree is grouped by component, so the layer a file
belongs to is read from its name instead of its path:

- **`*.component.ts`** — the only files that touch the DOM. Each owns a piece of
  it and exposes `connect$(...inputs) => Observable<void>`: streams in, applied
  views out. It may also expose raw sources (`Slider.changes$`), but the
  derivation behind them belongs to a pure sibling. Every component has the same
  shape — sliders, sketch, fps counter, window.
- **every other file in a component folder** — pure functions and stream
  derivations. No DOM, no rendering, no GPU: `frame.ts`, `slider.ts`,
  `slider.ts`, and the GLSL source of each formula (shader text is data).
  Testable by calling them. `gl/` is the one exception and says so in its name.
- **`*.program.ts`** — a `Program`. It lives in `src/programs/` rather than in the
  component folder, so the component never learns that it is in a window, and
  `main.ts` never names a component's inputs. This is also where a program
  derives what it displays: `AppState` carries app state only — `frame$`,
  `playhead$`, `panel$`, `preset$`, `compiled$` — and never a stream shaped for
  one window. If you are tempted to add a sixth field, check first whether one
  window could derive it from the five.
- **`AppState` vs a state type.** `Layout`, `SketchParams` and the like are
  values; `AppState` is the record of _streams_ that carry them, which is why
  every member keeps its `$` and why it is not called `State`. It lives in
  `program.ts` beside `Program` and `ProgramId`: splitting it out again brings
  back a type-only import cycle, since `Program.connect$` takes an `AppState` and
  `AppState.frame$` takes a `ProgramId`.
- **`src/main.ts`** — the graph and nothing else. Build `playhead$`, fold the
  window actions, hand back an `AppState`, subscribe once. No `tap`, no DOM, no GL
  imports — `compileFormula$` exists so that the last of those stays true.

`src/lib/` sits underneath everything: `dom`, `math`, `rx`, `color`, `storage`.

The program layer sits at the `src/` root, above the components it composes:
`program.ts` (identity and contracts), `layout.ts` (where each program's window
sits), `layout-store.ts`, `live-window.ts`, `controls.ts`, `main.ts`.

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
`sameGeometry` in `components/sketch/sketch.component.ts` is the only one.

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
  or one `scan` over a union of actions, instead. Three of these have been found
  and removed: `params$` -> `geometry$`, `controls.sketch$` -> `size$`, and
  `formula` sitting in `SketchParams` while also selecting the shader — which put
  `controls.sketch$` on both inputs of the sketch's `combineLatest`. The last one
  is why `SketchParams` carries no `formula`: the program is already compiled by
  the time those values are applied, so naming it there was both dead and a
  double-draw. `controls.formula$` is a separate output for the same reason.
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

    Thirty-four of them survive in `src/` today, every one a single line. Treat that
    as the ceiling, not the target: adding one means arguing it past the bar, and
    finding two that describe rather than warn means deleting them.

## The timeline transport

The timeline window is a progress bar with play/pause and stop, and it is the
worked example of the Program layer: `timeline.program.ts` composes
`hks-linear-slider` with `hks-transport` through the slider's `controls` slot,
the way `sketch.program.ts` slots the fps counter. Neither component knows about
the other.

The button emits **`toggle`**, not `play` or `pause`. A component that had to
choose between the two would need to know whether it is playing, which is state,
which components do not hold — so the fold owns the flip and `connect$(playing$)`
only swaps the glyph.

**Pausing must not need to read the playhead back.** That would close a cycle
where none is required. Instead `playing$` folds the commands _alone_, and the
position folds seeks plus frame _deltas_ gated by `playing$`:

- `isPlaying$` — commands only, so it cannot depend on position.
- position — `scan` over `seek` (a scrub, or `stop` seeking 0) and `advance`
  (`ms` since the previous frame, while playing). Pausing simply stops the
  advances, and the accumulator already holds where it got to.

Deltas rather than `elapsed` are load-bearing: `animationFrames()` restarts its
clock on every subscription, so resuming with `elapsed` would jump the playhead
back to the offset it started from. That is what `pairwise()` is doing there.

`duration: 0` no longer means paused — the button does that now — so
`timelineParams.duration` seeds at 8 seconds. The reducer still guards against 0,
which now means only "a loop of no length cannot advance".

## The formula editor

The editor is a small IDE, not a console: a preset picker above the source, the
highlighted textarea, and the compiler's message below. Its sources are
`changes$` (debounced text) and `selections$` (the chosen preset); `connect$`
takes the preset text to display and the error text to show.

**The picker's options are handed in, never imported.** `presets()` takes a plain
`{ value, label }[]` and `formula.program.ts` builds it from the registry, because
a component reaching into `components/sketch/` would break the layering. That also
keeps the editor a text editor: it knows nothing about GLSL formulas, only about a
list of named things it can be asked to show. `selections$` is a `defer`, so the
initial value is read after `presets()` has filled the list rather than at
construction, and `isFormulaName` narrows the picked string at the point `main.ts`
looks it up — a `<select>` can hold anything, so it is checked rather than cast. It deliberately never
echoes the user's own typing back into the textarea — only preset selections —
because writing the value back would reset the caret on every keystroke.

Compilation is the middle stage of `inputs -> formula -> render`, so it is a free
function — `compileFormula$(gl, source$)` in `components/sketch/compile.ts` — and not a
method on the canvas element. It _produces_ app state rather than displaying it,
which is the line: `connect$` connects app state to the UI, and anything that
derives state instead is a pipeline stage. The element owns the canvas and
exposes its `gl` for the stage to compile into. Failure is a value, not an
exception. `main.ts` compiles once into `compiled$` and each window takes what it
displays: `sketch.program.ts` keeps the successes, `formula.program.ts` maps the
failures to a message. Because a failure means the sketch's program stream simply
does not emit, `combineLatest` keeps the last shader that linked and the canvas
never blanks. Preserve that property. `connect$` also deletes each superseded `WebGLProgram`
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

The `Formula` contract lives in `components/sketch/formulas/formula.ts`, one level
above the implementations, so a formula can annotate itself without importing the
registry that imports it. `components/sketch/formulas/registry.ts` is the single
source of truth for selectable sketch
functions: one entry carries the key, the label, and the function. `FormulaName`
is `keyof typeof formulas`, so an entry automatically becomes an option in the
editor's picker and a shader the view can build. Do not add a
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
