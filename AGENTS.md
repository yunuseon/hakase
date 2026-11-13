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

## The backlog

`backlog.md` holds work that is decided but not done, in order, each item with
what done looks like. Read it before starting anything sizeable: the next step
is usually already planned there, and work that contradicts it needs that plan
changed first, not quietly worked around. When an item lands, delete it from
the backlog and describe the result here, in the section it belongs to; this
file says how the app is, the backlog says what is next. A new decision about
future work goes into the backlog in the same change that makes it.

## Rendering

A sketch is drawn by the shared engine (see "Image cables") from its store's
recipe, whether its own window shows it, a pedal reads it, or its strip or an
export samples it: a sketch window holds no WebGL context, and there is one
definition of what a sketch looks like at a moment. Everything below is that
drawing.

The sketch renders with **WebGL2**, not canvas2d. A formula is GLSL, the lattice
loop is the vertex shader, and `gl_VertexID` derives each cell's coordinates —
there are no vertex buffers at all, just one `drawArrays`. This is worth 40x at
`dimension: 128` (0.96ms against 38.4ms) and makes a million points viable, so do
not reintroduce a CPU-side draw loop.

**A draw mode changes the primitive, not the formula.** Each sketch picks `dots`,
`lines` or `surface` in its own panel. Dots are one vertex per lattice point;
lines are four per point (edges to the right and upper neighbours, clamped so an
edge point's missing neighbour collapses to nothing); a surface is six per cell,
two triangles. `latticePoint` in `sketch.vert` turns `gl_VertexID` into the corner
it stands for, and `formula` is simply evaluated there, so every formula works in
every mode and none of them knows which one it is in. `DRAW_MODES`' order is the
`uMode` integer, matched by `MODE_*` defines in both stages.

**A setting exists only in the mode it affects.** Dot size and depth scale
`gl_PointSize` and nothing else, so they belong to `dots` alone. `DrawStyle` is a
union discriminated by `mode`, and only `DotStyle` carries `baseSize` and
`depthScalar`, so reading them in lines mode is a type error rather than a dead
slider. The panel follows the type: `draw$` `switchMap`s over the mode, reading a
mode's own inputs only while it is selected, and `connect$` hides every row whose
`data-only` names another mode. The inputs keep their values while hidden, so
switching back to dots restores the size you left. A new mode-specific knob is a
field on its member of the union plus a `data-only` row, never an optional field
on all of them.

**The sketch is a real 3D space.** A formula returns a point, not a screen
position, and the camera is computed **in the shader**, because a formula may
script it: beside `formula` it can define `Camera camera(float t)` returning
`Camera(eye, target, up)`. `adapterFor` detects it the way it detects a `vec4`
return and appends `Camera view(float t)` that calls it, or a default that looks
straight down -z from `REFERENCE_DISTANCE` with y up — chosen so the z = 0
plane's -1..1 square exactly fills the shorter side, which is why a flat
formula still looks flat. Each sketch picks a **fit** for
that square, named after CSS `object-fit`: `contain` (the default, the square
fits the shorter side and a wide canvas shows more), `cover` (it fills the
longer side and the overflow is cropped, still undistorted) and `stretch` (x and
y scaled alike whatever the aspect, so it fills the canvas squashed, like the
flat sketch used to). `FITS` is a closed list, so a new mode is one entry and a
case in `scales`. It is purely a projection setting — formulas, the axes and the
pointer ray all follow it unchanged, because `aim()` reads the scale back out of
`uProjection`. TypeScript only supplies `uProjection` (the pure
`projection(aspect)` in `components/sketch/space.ts`, 25° field of view, set in
`prepare` because it changes only with size) and `uOrbit`. A camera that a
formula scripts loops with the playhead like everything else, so a shot loops
seamlessly; the old turntable switch is just one such camera and is gone.

**The viewer's drag sits on top of whatever camera there is.** Each sketch keeps
its own `Orbit` (yaw, pitch, distance) in its settings, advanced by `reduceOrbit`:
drag to turn, wheel to dolly, double-click or the **reset view** button to reset.
The button is disabled while the orbit is already the default (`sameOrbit`). The
orbit is saved with the window like every other setting.
`orbited()` in `sketch.vert` applies it around the camera's target using the
camera's **own** `up` as the pole, not world y, so a scripted camera with z up
(terrain's) orbits the right way, and the default camera with no drag is
reproduced exactly. `lookAt` falls back to an arbitrary side vector when the
camera looks straight along `up`, rather than producing NaN.

The **axes** switch draws x red, y green, z blue, ticks every 0.5 and the -1..1
square at z = 0. It is a second `drawArrays` of the **same program** with
`uPass` set to `PASS_AXES`, not a program of its own: the view comes from the
formula's camera, so a separate program would have to be compiled per formula
with every uniform set twice. `axisVertex` derives each line from
`gl_VertexID`, so `AXIS_VERTICES` in `sketch-program.ts` must match its tables.

**The axes are drawn in the formula's space, not the world's.** Every axis point
goes through `placed()`, the same mapping the lattice's points take, so in polar
space the x axis is a circle and the square becomes a ring, in spherical the x
axis is the equator — and a formula's own `space()` bends them too. A mapped
straight line is only straight at its ends, so each of the seven lines (three
axes, four sides of the square) is drawn as `AXIS_PIECES` short pieces. In a
wrapping space the x axis stops at ±1, because past that it would lap itself.

**Lattice and space reshape a formula from either side.** The vertex shader runs
`index → sampled(uv) → formula → placed(v) → camera`, and both ends are per-sketch
pickers with an optional formula hook, detected and appended by `adapterFor` like
`camera()`:

- **Lattice** (`LATTICES`: grid, polar, hex, jitter) decides where the samples
  are, with **focus** as a power curve that bunches them toward the middle or the
  edges while keeping their order, so lines and surfaces stay intact. Jitter
  hashes the integer cell, so it holds still from frame to frame. A formula may
  define `vec2 lattice(vec2 uv, float index, float count)` to place them itself;
  `builtinLattice` reads its cell and step from globals that `main()` fills,
  because the hook's signature has no room for them.
- **Space** (`SPACES`: cartesian, polar, cylindrical, spherical) reads the
  returned point in another coordinate system, with x always the coordinate that
  goes around, so a flat formula wraps without being rewritten. A formula may
  define `vec3 space(vec3 p)` instead.

**Wrapping closes the seam.** When x goes all the way around (a polar lattice or
any non-cartesian space, `wraps()`), lines and triangles connect the last
column back to the first (`uWrap`), and a surface draws one extra column of
cells, so `vertexCount` takes the wrap too. A custom `lattice()` or `space()` is
not known to wrap unless the formula says so with `#define WRAPS`, which
`createSketch` reads into `Sketch.wraps`; without it there is no seam closing. `sunflower` and `ribbon` are the
worked examples of the two hooks.

A sketch's **lens** is `perspective` or `orthographic` (`LENSES`, its index is
`uLens`). Orthographic has no distance to shrink with, so `lensScale()` turns the
viewer's dolly into a zoom of the picture; its rays are parallel and start under
the cursor, which `aim()` handles; and nearness is the dolly too, not
`uReference / w`, which would be a constant 4.5 and blow every dot up.

**Trails** fade the last frame into the backdrop instead of clearing it: a third
pass, `PASS_FADE`, draws one viewport-covering triangle of the ramp's first
colour at `1 - trails` alpha, with the depth test off so last frame's depth
cannot keep it from covering. It needs the last frame kept: the engine draws
into a target of its own that persists, and an offscreen canvas has
`preserveDrawingBuffer`, or the browser may hand back a cleared buffer. `prepare` clears the
colour, so changing a setting starts the trails afresh.

**Dot size has two parts that must stay apart.** Zoom scales a dot in
proportion — `uReference / reach` in perspective, the dolly in orthographic —
so the dot slider means its value at the camera's target. Depth then
exaggerates only nearness to that target plane, `(reach / w)` raised to
`3 × depth` and capped at 3×. Raising the camera's whole distance to that power,
as it first did, made a zoomed-out sketch's dots shrink to nothing: at distance
7 with depth 1.37 they were half a pixel. A pinch over a sketch is ctrl+wheel and
is left to the canvas zoom.

**The depth test is on in every mode**, which is load-bearing: points live in
space, so what is in front is decided by real depth. A dot's soft edge is the
trap — a translucent fragment still writes depth and punches a fringe through
whatever is drawn after it — so the fragment shader discards below half
coverage, except for dots under `SMALL_DOT` pixels, too small to show a fringe,
which would otherwise lose half of themselves and all but vanish. Larger dots
are a little crisper for it. The surface is lit from a flat
normal, `cross(dFdx(p), dFdy(p))` of the formula's output, and lighting uses
`abs`, because a lattice has no outside. Each corner is evaluated on its own, so
a surface costs six formula calls per cell; formulas that cover a full period
(torus, klein, trefoil) show a one-cell seam, because nothing tells the lattice
to wrap.

The formulas that used to project themselves (torus, klein, trefoil, bloom,
terrain) no longer do: they return the shape and leave the camera to the
camera. Trefoil and terrain are the worked examples of `camera()`: the knot holds
still while its camera circles it, and the terrain's camera hangs low with z as
up and looks across the hills.

**A formula has more to work with than its arguments.** Three things reach it
besides `x`, `y` and `t`, and all three cost a formula nothing unless it reads them:

- **Knobs** `k1`–`k4`, plain `float` uniforms in [0, 1], set by four sliders in
  each sketch's own parameter bar. They are `PanelParams.knobs`, per process like
  every other setting, so two sketches of one formula can sit at different
  settings. They are four uniforms rather than one `vec4` behind `#define`s,
  because a macro named `k1` would turn a user's own `float k1` into a baffling
  syntax error.

    **A sketch shows only the knobs its formula reads**, and it asks the compiler
    rather than the text: the linker drops any uniform nothing reads, so
    `knobsUsed` keeps the knobs whose location is not null. A regex over the source
    would be fooled by comments, by a `k1` that only feeds dead code, and by a
    local that shadows the uniform. It follows `shader$`, the last program that
    linked, so a broken edit leaves the rows as they were, and typing `k3` into a
    formula brings its slider up as soon as the edit compiles. A hidden row keeps
    its value.

    **A knob can move by itself.** Each one has a motion, `CYCLES` = still, 1, 2,
    4 or 8 swings per loop, and `knobAt` sweeps it from 0 up to its slider's value
    and back. Whole numbers only, so a moving knob ends each loop where it began
    and a loop still loops. The uniforms are set in `drawFrame`, every frame, not
    in `prepare`, because a moving knob changes with the playhead rather than with
    its settings.

    **A knob can follow a signal** instead (see "Signals"). What it follows
    is the sketch's **store's** link (`Documents.sketchLinks`, read through
    `linkedDriver$`), not its window's, so a picture a pedal reads keeps moving
    with the sketch's window closed (see "Image cables"). `knobValue` picks
    for each knob: a bound signal's value at the playhead, or the slider and its
    motion. The bound signals travel in `PanelParams.signals`, beside the panel
    rather than in it, so the live sketch, the thumbnails and an export all draw
    the same frame; a bound knob's row shows **follows**, with its slider and
    motion disabled but kept for when it is let go.

- **The pointer, in world space.** TypeScript sends only the mouse's clip-space
  position (`uPointer`, from `pointerAt`) and whether it is pressed; the vertex
  shader turns that into what a formula reads, because only the shader knows the
  camera a formula may script. `aim()` inverts the projection for that one
  screen point to get a ray (`pointerOrigin`, `pointerDirection`) and intersects
  it with z = 0 to get `pointer`, a `vec2` on the ground, so a 2D formula's
  `pointer - vec2(x, y)` stays under the cursor at any camera angle. A ray that
  misses the ground aims at a point `HORIZON` away instead of infinity, with
  `pointerOnGround` at 0; there is no memory of the last hit, because shader
  globals do not outlive a draw. `pointerDistance(p)` is a prelude helper for
  3D shapes.

    **`pointer` is in the formula's own coordinates**, not the world's. In a
    non-cartesian space the ray is met with the sheet z = 0 maps to — the ground
    for polar, a cylinder of `CYLINDER_RADIUS` or a ball of `SPHERE_RADIUS` — and
    that point is mapped back, so `pointer - vec2(x, y)` stays under the cursor
    in every built-in space and `lens`, `vortex` and `magnet` needed no change.
    `pointerOnGround` is 1 when the ray meets that sheet; a miss takes its
    nearest approach. A formula's own `space()` has no inverse, so the adapter's
    `ownSpace()` keeps it on the ground point; `pointerDistance(x, y)` measures
    through `placed()` in the world and works there too, at the cost of assuming
    z = 0.

    These are **globals filled in `main()`**, not uniforms, and
    `camera()` runs before `aim()`, so a camera that reads the pointer sees it
    unset — aiming needs the camera, and that order cannot be flipped.

    **Shift-drag is a press**, `pointerDown`; a plain drag still orbits. Both
    gestures come from the same `pointerdown`, split by an `accepts` predicate
    that `pointerDelta$` and `pointerDrag$` in `shared/drag.ts` now take, so the
    press never also turns the camera. Moving the mouse is a fourth input to the
    frame `combineLatest`, so it redraws a paused sketch without re-preparing it.

- **A tint.** A formula may be declared `vec4 formula(...)` and return a fourth
  value that picks the theme colour by itself; depth then only sizes dots and
  orders the surface. `sketch.vert` declares `vec4 point(...)`, and `adapterFor`
  appends the matching definition after the formula: a `vec3` formula gets its
  depth copied into the tint, so every existing formula is unchanged. The
  adapter goes **after** the formula so error line numbers still match the
  editor's.

The examples split the three apart: `lens` uses only `pointer`; `peaks` and
`flow` use only a tint (a sum's sign, a heading); `vortex` and `magnet` use both,
plus knobs. `FORMULA_GUIDE` documents them.

**A tint near 0 is invisible.** The ramp's first entry is also the canvas
backdrop, so low tints fade into it, and on `paper` everything below about 0.5 is
pale. The examples keep their tints in roughly 0.3 to 1 with
`0.65 + 0.35 * sin(...)` rather than `fract(...)`, which also avoids a hard colour
seam where the fraction wraps.

**A formula can keep state.** With `vec4 evolve(x, y, t)` every lattice point
keeps a `vec4` from one step to the next: `evolve` returns the next value from
`state()` and `neighbour(dx, dy)` (wrapping), `initial(x, y)` seeds it, and
`formula` reads `state()` to place and tint the point. `tank` (the wave
equation) and `coral` (Gray-Scott) are the worked examples.

- **A step is a pass of the same program,** like the axes and the trail fade,
  not a program of its own: it needs the whole prelude a formula can call
  (lattice, space, pointer, camera, knobs), and a second program would mean
  compiling every formula twice. `PASS_STEP` draws one `POINTS` vertex per
  lattice point onto its own texel of a float state texture (`side x side`,
  side = 2 x lattice), the vertex shader runs `evolve()` and hands the result to
  the fragment shader through a `flat` varying, which writes it. Two textures
  swap each step. They are created on texture unit 1: binding them on the active
  unit put them where the palette sampler reads, and WebGL refused every draw as
  a feedback loop.
- **Time is replayed, never accumulated.** The state at time t is `evolve`
  applied `stepAt(t, seconds, steps)` times from `initial`, at 60 steps a second
  or a formula's `#define STEPS`. Playing steps forward; scrubbing back or
  looping replays from the start (`evolutionTo`), so a moment always looks the
  same, and the strip and an export can show it. Which texture holds the state
  after a run is parity, so the plan carries it (`Evolved.front`) and the
  textures carry no mutable index. A jump to the end of Coral's 8 s loop replays
  about 3,800 steps in a third of a second; a loop restart is a few steps.
- **The state textures are a resource keyed by formula and lattice size**
  in the engine: kept across every other change, so a knob or a camera drag
  never resets the simulation, and released when either changes. The engine
  keeps one per store and **lane**: the live window and any pedal share the
  default lane, and a strip draws in its own (`lane: 'strip'`), or its replay
  from the first tile would throw the live simulation back every frame. An
  export has an engine of its own.
- **Thumbnails replay once per render**, left to right, drawing each tile as the
  replay passes its moment. Because that can cost a third of a second, a sketch
  that evolves renders its strip once things settle (250 ms), not on every frame
  of a drag; every other sketch keeps per-frame thumbnails.
- **Rules about places use `cell()`, never `x, y`.** `neighbour()` works on the
  state grid, but `x, y` are where the lattice and focus _draw_ a point. Sandpile
  first found its middle with `x, y`, and at any focus but 1 no point was near
  enough to the middle, so no grain ever fell and the canvas stayed blank.
  `cell()` is the point's place on the grid, -1 to 1, before any bending.
- The pointer can paint into a live simulation (shift-drag), but a replay uses
  the pointer as it is now, so what was painted is gone after a scrub back.
  Exports and thumbnails use the centre, unpressed.

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
   it, its toolbar icon, and how it connects to `AppState`. This is the only layer
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
- State keyed by `ProgramId` would collide, so `Workspace` is keyed by `ProcessId`,
  named from the log's sequence (see "Undo"), so a relaunch never reuses a dead id.
  Its `processes` array is ordered back to front, so a process's **index is its
  z-order** and `raise` is a reorder — there is no z-index counter anywhere.
- Global state cannot be fed by naming instances, because which instances exist
  changes at runtime. Each process instead emits `AppInput`s — `scrub`,
  `transport`, `source`, `diagnostic` — and `main.ts` folds whatever the running
  set happens to produce. That is why two editors drive the same formula and two
  sketches follow the same playhead.
- What genuinely is per-process stays per-process: a sketch window's size,
  pointer and pixel ratio make its moment in `sketch.program.ts`, never in
  `AppState`; the recipe it draws is its store's, shared by every reader.

**A formula is a document; a sketch is a viewer of one.** Each sketch picks a
formula by name in its own panel, and `AppState` exposes the text as a _selector_,
`source$(formula)`, not a stream. `main.ts` folds edits into a `Map` keyed by
formula name, so editing Rose reaches every sketch showing Rose and no other, and
two sketches can render different formulas at once. Absent keys fall back to the
registry, which stays the single source of truth for defaults — the fold starts
empty rather than seeded, so a formula nobody edited has exactly one definition.
`error$(formula)` is keyed the same way, so an editor only shows the diagnostics
of the formula it is editing.

Those two folds are `shareReplay({ refCount: false })`, and that is not
decoration. An editor's only subscription to `error$` is inside a `switchMap` over
its selection: with `refCount: true`, switching formula drops the last subscriber
for an instant and the entire edit and diagnostic history resets. State that
outlives its readers must not be reference-counted.

**An editor applies everyone's edits except its own.** Two editors on one formula
stay in step, because the text is one document; but writing an editor's own
keystrokes back into its textarea resets the caret mid-word. So every source
carries `from`, the `ProcessId` that wrote it — stamped in `liveProcess$`, which is
the only place that knows a process's identity — and the editor folds:

```ts
scan((shown, source, index) => (index === 0 || source.from !== self.id ? source.text : shown), '');
```

The first value always applies, so selecting a formula shows its current text;
after that only other processes move it. Comparing the incoming text with the
textarea instead would look equivalent and is not: `changes$` is debounced, so a
fast typist has already moved on when their own edit arrives, and the stale text
would be written over what they are typing. Selecting a formula emits no `source`
input at all; only typing does.

**Configuration follows the process, not the program.** A sketch's lattice, dot
size and depth are shown by `hks-sketch-controls`, slotted into that sketch's own
window, so two sketches can run the same formula at different densities and
colours. They were global Tweakpane folders once; the moment a program could run
twice, a shared panel meant two windows fighting over one set of knobs.

**There is no global panel any more.** `duration` was the last knob in Tweakpane.
It belongs to a clock, and a clock is a store of the timeline (see "Following"):
each timeline's transport emits `duration` like `scrub`, the clocks fold applies
it to that window's clock, and every window on that clock reads it back, so two
timelines on one clock edit one duration. Before adding a knob,
ask whether two processes would want different answers — if so it belongs in the
window; if not, it is still an input from a window, folded in `main.ts`.

The duration field commits on `change`, not `input`, so its own value echoing back
is harmless and needs no `from` stamp: it normalises what was typed (`12.34` reads
back `12.3`) and never lands mid-keystroke. A field that applied per keystroke
would need the editor's `from` fold instead.

**A window's settings are app state, keyed by `ProcessId`, and the inputs only
display them.** They used to live in the `<input>`s themselves, which made the
DOM a variable nothing could save or restore. Now each program describes what it
remembers as one member of `Settings` in `src/settings.ts` — `SketchSettings`
(formula, theme, `Panel`, `Orbit`), the formula editor's and theme editor's
selection — and emits the whole new value as a `settings` input. `main.ts` folds
those into one `Map<ProcessId, Settings>`, and each process reads its own back
through `Self.settings$`. Nothing is stored until a window first changes
something; until then `asSketch` and friends supply the default, so a default is
defined once.

That flips the components' contract, and both halves matter:

- **`changes$` reports only what the user did**, never a reading of the inputs —
  `ControlChange` is a field and a value, emitted from `input`/`change` events.
  Reading the DOM at subscribe time, as the old `startWith(input.value)` did,
  would emit the HTML defaults and overwrite the restored settings.
- **`connect$` writes every value back**, deduplicated per field. A programmatic
  write raises no event, so there is no loop, and writing the value a thumb is
  already at is harmless.

The program turns a change into the next settings with `withLatestFrom` over its
own `settings$` and a pure `withControl`/`reduceOrbit`. The fold is synchronous,
so the next pointer event already sees the last one applied. `Panel` is flat on
purpose: `PanelParams.draw` drops dot size in lines mode, and a setting the user
made must survive switching modes and back. `samePanel` dedupes it before it
reaches the renderer, or every orbit drag would rebuild the theme ramp.

**Launching is one action.** The toolbar emits a program id; `main.ts` turns it
into a `launch` action carrying that program's default `size` and the current
visible viewport, including its offset, and the reducer places the window in screen
coordinates before converting its position and size through the current camera.
Every new window is centred in the visible viewport, with no cascade offset.
The default size stays the same on screen at every zoom and is capped to the
visible viewport with a 20px margin. Quitting is
the window's own close button — ordinary window chrome, not a
per-program affordance.

Programs live in `src/programs/<name>.program.ts` and nowhere else. A component
folder that grows a file naming a window is the mistake this layer exists to
prevent — that file is a program, and it belongs one level up.

**The dependency arrow only ever points down.** Nothing under `components/` may
import `program.ts`, `workspace.ts`, `process.ts`, `settings.ts`, `state-store.ts` or the `appearance*.ts` modules; the check is one grep and it is worth running. This is
why `HksWindow` emits an untagged `WindowGesture` rather than a `WorkspaceAction`:
the window does not know which program it holds, so `liveProcess$` — which is
program-layer, at `src/` root — is what stamps the `id` on.

It is also why the layout is cut in two. Frame maths (`moved`, `resized`,
`frameFrom`) and camera maths (`components/canvas/camera.ts`) are program-agnostic;
the app's actual workspace — processes keyed by `ProcessId`, the default four
windows, the toolbar's state, `parseWorkspace`'s schema — is app configuration
and lives in `src/workspace.ts`. If you find yourself adding a
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
`adoptedStyleSheets`. Standalone lit-html renders templates inside the shadow root. Application state
and orchestration stay in RxJS; there is no second reactive state model.

**lit-html owns DOM structure; RxJS owns the process.** Components remain plain
`.component.ts` custom elements with shadow roots, slots and adopted CSS. Use
`html`/`svg` tagged templates from standalone `lit-html`; there is no JSX compiler,
LitElement lifecycle, signal layer or framework store. `mountView` mounts static
markup; `renderView` takes plain view data and renders synchronously on `update`.
Both come from `lib/lit.ts`. Merge each rendering's `lifetime$` into `connect$`:
process teardown disconnects directives, clears rendered content and prevents late
updates. The AbortController in that adapter guards only the render lifetime;
it holds no application or interaction state. Components own no subscriptions.

Use `.value` and `.checked` property bindings, `?disabled`/`?hidden` boolean
bindings, `ifDefined` for optional attributes, and `styleMap` for style objects.
Use `repeat` with stable ids for editable lists and indices for positional slots.
`withValue` is a typed, stateless conditional for optional rows. `displayValue`
applies remote text through a `ref` callback while preserving a focused draft.
Avoid `unsafeHTML`; Prism's generated token markup is the sole HTML injection in
a component. SVG fragments use `svg` templates so their namespace stays correct.
Geometry measurements, focus, scroll, clipboard, popover/dialog methods and
canvas/WebGL drawing remain explicit effects. Custom-element routing uses normal
`data-*` attributes, and editable controls use a normal `editable` attribute.
The mount adapter upgrades disconnected subtrees before constructors query child
controls. The renderer never derives business state; pure functions and RxJS
still decide what a component displays and when it changes.

**A component folder holds everything only that component needs**, whatever layer
it belongs to: `components/sketch/` owns its `gl/`, its `shaders/`, its
`formulas/` and its compile stage, because nothing else imports them. Only a few
modules are genuinely shared — `lib/`, `shared/drag.ts`, `shared/playhead.ts` and
`shared/camera.ts` (the canvas and the navigator both read the camera) —
and a module earns `shared/` by having a second importer, not by being general in
spirit. If you reach into another component's folder, either the thing you want
belongs in `shared/`, or the two components want to be one.

**A window is a component that holds one other component.** `hks-window` owns the
frame — title bar, drag, the eight resize handles — and knows
nothing about what it contains; the content component owns no window chrome and does not
know it is in a window. Keep that line: the moment a content component reaches
for its own title bar or placement, the two are welded together again and neither
can be reused. A window's inputs are a `WindowView`: a frame plus a `kind`, either
`floating` (positioned and sized by its frame) or `fitted` (positioned by its
frame but sized by its content). Every program window is `floating`, so
`Program` has no `kind` at all; content-sized chrome may use a `fitted` frame,
because its size is its row of tiles.

**Every window is the same window.** No window has chrome of its own, no mode, and
no window that another one has to be special-cased around. A feature that only
one window can use — the terminal's docking was one — buys a branch in
`WindowView`, a branch in `connect$`, a button in the shared title bar, a state
reducer, a keyboard map and an `AppState` field, all to serve a single window. If the
next such feature is worth that, it is worth making it work for every window.

**Nothing is declared in `index.html`** beyond the script tag and the favicon link
(`public/favicon.svg`, a rippled dot lattice with a dark variant), and no window is
mounted by hand. The programs are one record in `src/programs.ts`, and a window's
existence is
a subscription: `liveProcess$` creates the `hks-window` in a `defer` factory and
removes it in `finalize`, with its views merged in as `ignoreElements` side
pipelines so one subscription both drives the DOM and reports back. Launching and
quitting is therefore just
`switchMap(running => running ? liveProcess$(...) : EMPTY)` over the processes
the workspace fold holds. Adding a program is one entry in that
record, in toolbar order; nothing in `main.ts` names it.

**Chrome is the UI that belongs to no program**, and the word comes in two
kinds. Unqualified, it always means **workspace chrome**: what `mountChrome`
mounts once and keeps for the app's whole life, either in screen space in the
canvas's `chrome` slot (the navigator and its launcher, the palette, the
selection bar, the section-drawing preview, the placement ghost) or in the
world layer beside the windows (the seams, the state wiring, the section
areas). **Window chrome** is what `hks-window` draws around every program (the
title strip, state chip, close button and resize handles) and is always written
out in full. The two never mix: workspace chrome is not a window, and window
chrome knows nothing of the workspace.

**The launcher and navigator are one piece of chrome.** `mountChrome` puts one
`HksToolbar` in `HksNavigator`'s `launcher` slot; only the navigator occupies the
canvas's chrome slot. The launcher owns the category menus (Make, Logic,
Convert, Plan, System) and emits program ids. The navigator owns their position alongside State,
zoom and the live map. Neither component imports the other. `categoriesOf` in
`program-categories.ts` derives the menu contents from program definitions for
both the app and Storybook, so previews cannot silently omit programs.

The compact card shows category icons, State, the map thumbnail and zoom. The
expanded card keeps those icons in its upper-left corner and adds history, map
section targets and navigation controls. Narrow cards wrap the compact view into
two rows. There is no separate edge toolbar, hide tab or position menu.

**The compact card is a grid; the expanded card is placed by hand.** The
compact row's areas (launcher, State, thumbnail, zoom) let a larger control push
its neighbours along, and the thumbnail and its toggle share one cell. The
expanded card still pins its groups to corners, so every offset there that clears
a control is written from `--control-lg` (`calc(var(--control-lg) *
var(--launcher-keys) + var(--space-5))` for State beside the launcher's keys),
never a literal: a literal was what put State on top of the launcher once touch
sizes grew it. The key count is `--launcher-keys`, which `mountChrome` sets on
the navigator from the same `categoriesOf` it hands the launcher, because the
navigator cannot count what is slotted into it; the card's compact width reads
it too. A literal 4 there wrapped the fifth key, Convert, onto a second row at
every width.

Category menus use native details with a manual top-layer popover. They prefer
the space above the card, clamp to the viewport and scroll when necessary;
`popupPlacement` is shared with custom selects. Only one category opens at a
time. Arrow keys and Home/End navigate, Escape restores the category trigger,
and a launch or outside pointer closes the menu. Merge the launcher's
`connect$()` into the composition lifetime so open popovers and listeners are
disposed with it. Icons use the shared `Icon()` renderer and native controls
use `controlsSheet`.

Saved `Workspace.toolbar` docking/floating metadata remains readable for
compatibility with existing snapshots and undo records. It no longer positions
live chrome. Do not reconnect a floating toolbar host or offer the old toolbar
position commands; new launch and navigation actions belong to this single card.

Do not "improve" this by mounting eagerly and hiding closed windows with CSS.
The point is that a closed window holds no subscriptions at all — no `rAF` loop,
no listeners, no GL draws — which a `display: none` window would.

**The graph has a cycle and it is closed by ordering, not a `Subject`.** Windows
emit the workspace actions that produce their own frames: `signals$` carries
`WorkspaceAction`s out of every open window, `workspace$` folds them, and
`slot$(id)` hands the frames back in. Two things make this cycle safe, and both are load-bearing:

- A program's `connect$` is a **function of `AppState`**, called from inside
  `switchMap` — long after `state` is initialised. Storing finished streams in
  the table instead would evaluate the cycle at construction time.
- `startWith(seed)` sits **before** `shareReplay`, so the seed is in the replay
  buffer before the source is subscribed and the windows mount. A window that
  subscribes to `workspace$` while mounting reads the seed rather than hanging.

**The cycle closes in one place.** `main.ts` holds the only back edges, four
`defer`s: the windows' output (`signals$`, `inputs$`) and the two action
streams folded into `historyOf`. Every `*.graph.ts` module takes those as
ordinary parameters and never reaches forward itself, so a reader sees the whole
loop in `main.ts` and nowhere else. The one exception is internal to
`state-mode.graph.ts`, where the session and the wiring events feed each other.
A new module that needs a stream built later takes it as a parameter and lets
`main.ts` defer it; a `defer` inside a module that names another module's stream
is the old shape creeping back.

The tool is drawn as **paper-like windows**: one panel colour with no header band,
a hairline `--edge`, a `--radius-3xl` corner and a soft `--shadow`, a transparent title strip
holding the program's icon and its name, and a close button that only shows on
hover or focus. The frontmost window is **focused**, which the window marks with
`data-focused` but deliberately does not style — a ring around it was tried and
removed as noise. That window chrome lives once in `components/window/window.css`. Interiors
follow it — Geist for UI text, Geist Mono for code, readouts and clocks, both as
`--font-ui` / `--font-mono` from `styles.css` — and nest no frames of their own; a
well (`--well`, rounded) marks an editable area instead of a border. The design
these follow is the Claude Design canvas "hakase — modern redesign".

**Every program fills whatever window it is given.** The window body is a flex
column and each content component sets `block-size: 100%` on its host, so a
window resized taller or narrower reflows its content instead of leaving it
parked at the top. Two patterns carry the rest:

- A footer (the task manager's, the tickets' ) takes `margin-block-start: auto`, so
  it sits on the window's bottom edge however tall the list above it is.
- Something that must stay square (the playhead dial) makes its host a size
  container and sizes itself `min(100cqi, 100cqb)`, so it fits whichever side of
  the window is shorter rather than following the height out past the sides.

Narrowed to the minimum width (180), every program still fits across; only the
formula editor's long lines run on, inside its own scrolling code box. Below
about 150 units of height there is not room for most programs at all, and their
content runs past the frame — so **each program declares a `minimum`**, and
`liveProcess$` stamps it onto every `resize` gesture it forwards. The reducer
clamps to the action's minimum, not a global one, because only the program
knows how small its content can go; the window component still knows nothing
about which program it holds.

**Focus is part of a window's slot, not a stream of its own.** `Self.slot$` carries
`{ frame, focused }` together, because a raise changes both; a `frame$` and a
`focused$` combined in `liveProcess$` would be the two-paths-into-one-`combineLatest`
bug, firing once with the stale half.

`hks-sketch` exposes two slots: `status` for the fps readout, laid over the canvas
top left, and `controls` for the parameter bar, **below** the canvas. The
controls in turn expose an `animation` slot for their second tab. The bar sat
over the drawing once and was in the way of the one thing a sketch exists to show;
only a readout that small may cover it. Draw mode
is a three-way radio group, still real `<input type="radio">`s, so the keyboard and
the `change` event behave as a native control.

The formula editor has a line-number gutter. It is a third layer under the
textarea, with the same font, line height and padding as the other two, and all
three use `white-space: pre`: with wrapping on, a long line would take two rows
and every number after it would sit one row too high. The gutter follows the
textarea's `scrollTop` on the same `scroll` event the highlight does.

**What is open is a program's business: the task manager.** `tasks` is an
ordinary program whose component, `hks-task-manager`, lists one row per process,
labelled per program in launch order (`sketch 2` is the second sketch open) by
`listed` in `workspace.ts`, with the frontmost marked. `AppState.tasks$` carries
the list with each program's title and icon already resolved, because a program
cannot import the table it is in. A row emits a `task` input, `reveal` or
`close`, and `main.ts` routes it into the workspace fold — `close` is the same
`quit` the window's own button sends, and `reveal` raises the window and centres
the camera on it in one reducer step, shrinking the zoom only if it would not
fit. Closing the task manager from its own list is fine: its row is just a
process like the others. The footer's **Close all** closes every _other_ window:
it emits `close-others` with no id, and the fold keeps the process `from` stamped
on, so the manager never has to name itself. Its count comes from the program,
which knows `self.id`, rather than from the row count, which would include it.

**Tickets unify the todo list and board as views of one document.** Each state
holds one `Tickets` value, folded by `reduceTickets` in the documents log;
windows choose List or Board through their own view-only settings. Ticket numbers
are monotone within a state; ids come from the log's sequence. Statuses have a
name and an `open`, `active` or `done` stage. Progress counts stages, never status
names, and quick capture (`ticket` or `todo`) adds to the first open status.

Tickets carry a title, description, priority, optional parent and blocker links.
Parent and blocker cycles are refused by the reducer and cut when parsing stored
data. Deleting a parent promotes children to its parent; deleting blockers removes
their links. A done blocker remains linked but no longer counts as blocking.
Deleting a status requires it to be empty, and the last status cannot be deleted.

**Tags categorise tickets independently of their workflow.** Each ticket owns a
sorted set of lowercase names, trimmed and deduplicated by `normaliseTags`;
old tickets parse with no tags. Add/remove commands edit that set, so undo,
sharing, snapshots and forks treat tags like every other ticket field. Detail
fields offer existing names from that state; row and card chips select a filter.
The filter belongs to the window's live program stream and is transient. Its
listing is derived from the full document, which details and blocker counts
still read. Filtered moves resolve against visible neighbours before reaching
the full reducer, and a new ticket inherits the selected tag. Clear done is
hidden while filtering so it cannot silently delete unseen completed tickets.

Rows and statuses drag by their grips, with arrow keys as the keyboard equivalent.
Both views use the same drop rule: the nearest status in both dimensions, then the
position among its other tickets. One shared gesture stream drives indicators and
commands; document-level pointer ends release it. Rows update in place by id,
without rewriting focused fields. The tag form reads its draft in one shared submit listener before clearing it. The detail panel's selected ticket is transient
view state, folded from open/close events, never saved in the document.

Ticket actions use unboxed, muted line icons with a soft circular hover state,
like the window chrome. Creation is a floating + in the toolbar, each column, and the sub-ticket heading;
cleanup and deletion use small icons, and the creator uses arrows and a final
check. Every icon keeps a tooltip, an accessible name and a visible keyboard
focus ring. Avoid adding filled action pills or duplicate text buttons here.

**New ticket opens a three-step creator**: Basics, Tags & links, then Review.
Its draft is one pure `reduceCreation` fold owned by the program, discarded on
cancel or a store switch, and never saved. The creator is a separate component;
the program slots searchable tag, parent and blocker pickers into it. Submission
emits one `add` carrying all fields, so a complete ticket is one undo step and
never appears half-filled. Every ticket + opens the creator with its status or parent preselected;
command-palette capture keeps its short path. The ticket model lives in `shared/tickets.ts` because both the list
and creator use it.

**Ticket-link and tag multiselection** uses `hks-search-picker`, taking plain
choices and selected values. It owns no ticket knowledge. The program supplies
keys, titles, status and tags as searchable labels and hints; parent and blocker
choices in existing details use the same cycle checks as before. Arrow keys
move between results, Enter selects, and Escape closes the picker before the
creation dialog. Ticket-list search intersects the tag filter and searches key,
title, description and tags. Filtered moves use the visible listing under either
kind of filter, while details still read the complete document.

### Sizes: a rem scale, and the smallest screen

**Every size in a stylesheet comes from a token in `src/styles.css`**, rem-based
the way Tailwind's are, so the root font size scales the whole interface at
once. `--spacing` is 0.25rem and `--space-N` is N of it, with half steps
(`--space-1-5`) up to 4 and the usual larger ones after; `--text-*` is the type
scale (`--text-sm` is the 12px most interiors read at), `--radius-*` the
corners and `--control-*` the heights of buttons, icons and choices. A value
off the scale is written as Tailwind writes it, `calc(var(--spacing) * 1.25)`,
so it stays exact and stands out as a candidate to snap to a step; a new rule
should reach for a named step first. Inside `min()`, `max()`, `clamp()` or
`calc()` the bare product is enough. Container queries cannot read custom
properties, so their breakpoints are rem literals, which keeps them in step
with the content they guard.

**Pixels stay where they are deliberate or where JavaScript owns the
geometry.** Borders, outlines, outline offsets, box shadows, strokes and
anything under 2px are hairlines and stay px, and so do the windows' resize
handles. On a coarse pointer their `--band` and `--corner` grow inversely with the canvas zoom, keeping a usable screen hit area without changing frame maths.
Frames, the camera, snapping and the minimap are world units, never rem, so a
larger root grows a window's contents, not its frame.

**Geometry that script lays out scales by `remScale$`**, the root font size
over 16, from `lib/rx.ts`. Nothing fires when the root size changes, so it
watches a hidden 1rem probe with a `ResizeObserver`, and it measures once on
subscribe because a hidden pane delivers no resizes. Its two readers take it
in the way each layout allows:

- **The state map scales its board, not its layout.** The transform is
  `scale(rem) translate(camera) scale(zoom)`, so the nodes, wires and their px
  constants (`NODE_WIDTH`, `HEADER`, `PORT_HEIGHT`) grow together while the
  camera and the hand-placed `positions` stay in map units, and saved maps
  need no migration. Everything that turns screen pixels into camera units
  (`viewport()`, the sizes for **Fit** and the first fit) divides by
  `remScale()`; node drags read the board's own scale from its box, which
  already includes it. The node CSS therefore stays px: it is in map units.
- **The state-mode sockets take it as a `unit`.** They sit in world space beside
  frames that do not scale, so the board trick is not available: `wiringOf`
  multiplies every offset (`SOCKET_HEIGHT`, `SOCKET_WIDTH`, `INDENT`, the title
  clearance, the menu clamps) by the unit, `anchorOf` and the group rail do the
  same for the jack centres, the view carries `unit` so `sameWiring` sees it
  change, and `state-wiring.css` is on the tokens, so the jacks the CSS draws
  and the wire ends the script computes grow together. `coarsePointer$` selects 44-unit rows instead of 28; row spacing, menu placement, anchors and the group rail all read that same `rowHeight`. The larger jack hit areas fit between those rows. Touch keeps the store selectors visible.

**The smallest supported screen is 360 x 640 CSS pixels, portrait**
(`MINIMUM_VIEWPORT` in `lib/dom.ts`, also Storybook's Phone width): the narrow
end of current Android phones and comfortably inside every iPhone since the
SE's 375. Program windows live on the infinite canvas and need not fit it,
but every piece of fixed chrome must: the navigator card compact and expanded,
its category menus, the command palette, the selection bar and the
section-drawing and placement hints. Banners centred at the top are
`inline-size: max-content` capped to the viewport less `--space-6`, and wrap
rather than run off, which is why the placement hint is no longer `nowrap`.
Check a chrome change at that size in every appearance before calling it done.

**Touch gets bigger controls from one media query.** Under
`@media (any-pointer: coarse)` in `src/styles.css` the `--control-*` tokens grow
to 2.75rem, including on hybrid devices. Shared control faces keep that minimum
hit height. Windows and lists keep their actions visible without hover. Only what a token cannot express is overridden per
component: the navigator's State button drops its label on touch, and its
expanded card stacks its tools above the zoom row, as the narrow container query
does, because the 320px a phone leaves the card is not narrow enough to trigger
it. The browser pane's mobile preset matches `pointer: coarse`, so that is where
to check it.

**Each program reflows its own contents.** Components own wrapping toolbars,
shrinkable form columns and their scroll regions; the window body is only a
last scroll fallback. Compact card/detail layouts use container queries in rem,
so increasing the root size activates them even without resizing the frame.
Spatial editors keep local scrolling rather than squeezing cells into tiny
controls: habits retain their date grid; drums keep wide steps and sticky row
labels which can be swiped to scroll while dragging a cell still paints. The
sketch and note retain useful minimum drawing/editing areas when controls grow.
Program stories include a Compact (240px) variant, including the silent Voice
and Drums fixtures. Check those, minimum window heights, open detail/guide/error
states and roots of 16, 24 and 32px, in all appearances.

**Visible viewport and workspace camera stay separate.** `viewport$` remains the
layout viewport used by world geometry. `visibleViewport$` follows the browser's
visual viewport resize and scroll events with teardown; the canvas passes its
bounds to fixed chrome as CSS properties. The navigator, palette, selection and
placement hints, and ticket dialog account for those bounds and safe-area
insets. Dropdowns and launcher popovers clamp to the visible bounds and reposition
when the software keyboard changes them, without changing saved frames or the
workspace camera. Actual iPhone keyboard, scrolling and gesture behaviour still
requires device verification.

### Shared UI primitives

The UI library lives under `src/shared/ui/`; Storybook consumes it, as do the
program components. Adopt `controlsSheet` **before** a component's own sheet.
Use `ui-button` / `ui-icon` for actions, `ui-field` for text fields and selects,
`ui-range` / `ui-check` / `ui-colour` for native inputs, `ui-choices` with
`ui-choice` or `ui-segment` for choices, and `ui-badge`, `ui-hint`, `ui-empty`
for supporting content. These are native elements with a shared stylesheet,
not custom-element wrappers: forms, labels, required fields, keyboard events
and the existing `data-*` routing keep their browser semantics.

The shared sheet owns the control face, focus ring, disabled state and colour
tokens. Component sheets keep layout and specialised widget geometry. Its base
selectors use `:where` so deliberate local variants remain possible; do not copy
a primitive's entire CSS to make a variant. Ranges have standard and precision
variants; colour fields have round and rectangular variants. The shared
`ui-listen` face and `ListenIcon()` serve Voice and Drums. `Icon()` renders action
paths from `ICONS`; `SymmetryIcon()` marks its SVG with `ui-symmetry-icon` so Paint,
Pen and the catalogue share its styling.

Button-based radio groups (`role="radiogroup"` / `role="radio"`) merge
`connectChoices$(shadow)` into their `connect$`. It keeps one tab stop, moves
through enabled choices with arrow keys and Home/End, respects RTL, and commits
through the existing native click source. It stores no application selection;
`aria-checked` still arrives from the owner's fold. Real radio inputs keep native
keyboard handling. The adapter's observer and listeners end with the component.

`npm run check:ui` checks every component module for shared-sheet adoption,
custom dropdown usage, radio keyboard support and a matching catalogue entry.
It runs as part of lint. The only intentional catalogue exclusion is Storybook's
own host, which would otherwise display itself recursively. Shared primitives
and less visible states (wizard, export progress/failure, FPS and preview errors)
also have direct stories rather than being discoverable only in a composition.

**Dropdowns and free-text autocompletes** use `hks-select` from
`shared/select/select.component.ts`; do not add native selects or datalists.
The host takes inert option children, exposes `value` and `disabled`, and emits
one bubbling `change` when a choice is committed. An `editable` attribute turns
it into a free-text autocomplete; typing updates its draft value and Enter can
submit its containing form. Owners clear that value explicitly on form reset.
Merge `connectSelects$(shadow)` into the owning component's `connect$`; it connects
dynamic controls and tears them down on removal without lifecycle subscriptions.
The pure reducer owns popup/search/keyboard state, and the shared stylesheet
uses appearance tokens. Popovers render in the top layer with viewport clamping
and upward placement near the bottom. Arrow keys skip disabled choices,
Home/End navigate, Enter chooses, Escape closes before an enclosing dialog,
and Tab advances focus. Longer lists automatically expose search. Canvas
shortcuts treat the host as editable. Ticket multiselects remain program-fed
pickers because they also support hints, multiple choices and creating tags.

Old todo and board documents migrate independently: Todo Main becomes Tickets
Main, while Board Main keeps the `board` store id and the name Board. Old windows,
progress bindings, store copies and saved blueprints migrate with them. Board
windows retain Board view. Keep this mapping when retiring a program: otherwise
the next snapshot can discard documents whose old store is no longer registered.

**Notes are documents a window chooses between**, like formulas: one `Notes`
collection folded in `main.ts` and saved, and each note window's choice in its
own `NoteSettings`. A window that has never chosen (`settings$` still undefined
on its first emission) is a new launch, so it creates a blank note and turns to
it; a restored window has chosen and does not. `shownNote` falls back to the
first note when the chosen one was deleted elsewhere. Edits are folded per
keystroke, not debounced, so the text that comes back always equals what the
textarea holds and is written only when it differs: that is what keeps the caret
still, without the formula editor's `from` fold. Delete asks first: one click
arms it for three seconds, a second deletes, both read from one shared `scan`.

**The focus timer is one clock for the whole app**, like the playhead:
`createFocus$` folds `toggle`, `reset`, `skip` and `length` commands with
`reduceFocus`, and every focus window reads it back, so two windows show one
timer and closing them does not stop it (`refCount: false`). It reads itself
through a `defer` to gate its ticks, as the transport does, and for the same
reason: a phase that runs out pauses on the next one. The ticks are an
`interval` of wall-clock deltas, **not `animationFrames()`**, which stop in a
hidden tab and would freeze the timer exactly when it is not being watched.
`completed` counts phases that ran out by themselves, so `chime$` (in
`src/chime.ts`, beside `persistState$`, with the one `tap` that plays it) rings
for those and not for a skip. It is saved where it last stood still, like the
playhead, and never restored running.

**A focus timer can follow an agenda**, through a store input like a voice's
pitch: `focusProgram.inputs` declares `agenda` with `from: 'store'`, so the
state menu, state mode, the state map and the prune all handle it with no code
of their own. While a block of that agenda runs, the block **is** the timer:
`planOf` turns it into a `Plan` (title, elapsed, length) and `focusView` shows
the block's name, countdown and progress, with the controls disabled because
the plan drives them. Outside blocks the timer is the ordinary pomodoro again.
Three choices hold it together:

- **The link is a document; the timer is not.** Timers keep their own fold, so
  what a timer follows lives in `Documents.focusLinks` (`{ sources: { agenda } }`,
  a `Linked` like a signal's), set by the documents reducer's `link` case,
  saved, pruned, forked and undone with the other documents. Putting it on
  `Focus` would have meant teaching the link, the prune and the state map about
  a fold that is not a document.
- **The plan is derived, never stored.** `plansOf` maps every linked timer to
  the block running now, from the agendas and the wall clock, which runs only
  while some timer follows an agenda. Nothing ticks for a plan.
- **Its edges are the only effects.** A block that starts pauses that timer
  (`pause`, idempotent, from `startedPlans`), so a pomodoro does not run on
  under it and chime mid-block; a block that ends rings the chime
  (`endedPlans`), as a phase that ran out does.

**The agenda is a day planner over one shared `Agenda`** of time blocks, each
on a `Day` (`lib/day.ts`: local `YYYY-MM-DD`, stepped through a date at noon so a
daylight-saving change can never skip or repeat a day). Each window's day is its
own setting, and `null` means _today_: `day$` combines it with `wallClock$`, so a
window left open overnight turns the page by itself and the now line moves.
Drag on empty time to make a block (a plain click makes an hour), drag a block
to move it, its bottom edge to resize; everything snaps to `SNAP` minutes in the
reducer. Minutes are read from the column's `getBoundingClientRect`, height
included, so the canvas zoom needs no special case. A move or resize emits on
every pointer move and the block follows through the fold, so there is no local
drag state; `laidOut` puts overlapping blocks side by side, derived on every
render rather than stored.

**Habits are one shared list of ticked days**: each habit keeps the `Day`s it
was done, sorted and unique, and the window shows the last `WINDOW_DAYS` up to
today, scrolled so today is in view, with the names pinned. `habitsView` derives
the grid and each streak from the list and today (`wallClock$` again), so the
columns move at midnight on their own. A streak counts back from yesterday while
today is unticked, because the day is not over. The rows share **one CSS grid**
(`display: contents` on each row): rows that were grids of their own sized their
first column apart and the day headers drifted off their cells. Deleting a habit
takes two clicks on the same ×, like a note, because it takes its history with it.

**The world clock is one shared list of IANA zones**, everything else derived
per second from `wallClock$` by `clocksView`: the time, the day relative to
yours, the offset (from `formatToParts`, read back as if UTC, so daylight saving
and half-hour zones come out right) and whether it is day there. A typed zone is
matched against `Intl.supportedValuesOf('timeZone')` case-insensitively, **not**
normalised with `resolvedOptions()`, which answers `Asia/Kolkata` with the legacy
`Asia/Calcutta`; the two engines in play (the browser and Node for the tests) do
not even list the same names, which is why there is a fallback at all.

**Bookmarks are named, in groups, and only ever web addresses.** One shared
`Bookmarks` holds groups of bookmarks, each with a name and a URL, and works like
the board turned on its side: bookmarks drag within and across groups
(`dropTarget` picks the nearest group and counts the _other_ bookmarks above the
pointer), ↑/↓ on a grip emit `step`, an intent the fold turns into a move that
crosses into the next open group at either end, groups reorder by their own
grip, collapse (saved with the document), and delete only while empty. Groups
and bookmarks are updated in place by id, for the board's reasons.

`safeUrl` accepts `http:` and `https:` with a dotted host and nothing else,
adding `https://` to a bare address, and `parseBookmarks` runs every stored
bookmark through it again: the snapshot is untrusted, and a `javascript:` URL in
an `href` would run inside the app when clicked. Bookmarks open in a new tab
with `noopener`. Each shows its site's own `/favicon.ico` (`faviconOf`, https
only, no referrer) over a letter badge that stays until the image loads with
real pixels; no icon service is asked, so no third party sees the shelf. Image
`load` and `error` **do not bubble**, so the list listens in the capture phase.
A refused address stays in the field, marked. Editing a bookmark is per-window
view state (`editing$`: the ✎ clicks and a `focusout` that leaves the editor,
not one that moves between its two fields).

This was the links shelf, a flat list. `parseBookmarks` turns a stored `links`
list into one group, and `parseWorkspace` brings a saved `links` window back as
a bookmarks window. **`parseWorkspace` drops an unknown window on its own**: it
used to reject the whole workspace for one, and renaming this program while the
app was open reset a user's layout, sections and camera to the default, which
the next save then made permanent. Retiring a program id needs that mapping, or
its windows quietly disappear.

**Sections are painted workspace areas**, used only for navigation. They own no
programs and never move or save them. Each section stores its id, name and a
non-overlapping set of rectangles (`rects`), whose exact union is its area.
Bounds, outlines and membership are derived by the pure geometry in
`shared/area.ts`; `section-areas.ts` merges connected sections and splits erased
ones. Never replace an area's shape with its bounding rectangle: that fills
cutouts and the empty corners of L-shapes.

The navigator offers **Paint area**, **Erase area** and **Select programs**.
Each starts a mouse/touch rectangle gesture, previewed by `hks-section-drawing`.
Release commits one undo step; Escape, right-click, pointer cancellation and
blur cancel it. Overlapping or edge-touching paint merges sections transitively,
keeping the oldest name and id. Erasing can cut a hole, split a section into
separate named areas, or remove it entirely, without touching any program.
Split ids derive from the action's sequence for stable undo replay.

`hks-sections` draws only the filled union and its external and hole boundaries,
never the internal rectangle edges. Labels can be renamed by double-click and
areas deleted. Only labels accept pointer events; the ground remains pannable.
Its host must create no stacking context or its labels become trapped under
program windows. The navigator renders the same area geometry. Legacy sections
saved as `rect` migrate to `rects`; overlapping old rectangles merge on restore.

**Selection is independent of areas.** Hold Shift and drag the canvas background
to select in one gesture, or use the navigator's selection tool and then drag over intersecting
programs to highlight them. The background cursor becomes a crosshair while Shift
is held. Shift-click a window to add it to the selection or remove it if selected.
`selectedIn` and `selectionView` in `selection.ts`
derive ids and the selection count; the transient selection and copied
snapshot live in streams, outside documents and history. Closing a selected
program removes its highlight. Dragging a selected window's title bar raises and moves
the selection together, including each member's attached windows; all members
share one snap offset. The selected ids travel with the move action so undo
replay does not depend on the current selection. Dragging an unselected window
still moves only its attached group. The selection bar offers Copy, Paste, Save as
blueprint, Delete and Clear. Delete closes just the selected programs in one undo
step, keeping their stores like a normal window close. Cmd/Ctrl+C copies;
Cmd/Ctrl+V enters placement, both left to
native controls while editing. Copying nothing leaves the previous copy intact.
The clipboard is local to the running app and is not a saved blueprint.

Copy and Save as blueprint share `blueprintOf(documents, clocks, selectedIds)`.
Capture uses the selected programs' measured bounds and carries their states,
follow chains, settings, formulas and connections between selected programs.
Paste logs the captured snapshot itself, so replay never depends on a changed
clipboard, and makes one undoable placement with fresh ids. Neither paste nor
blueprint placement creates an area. `hks-window` draws its own selection outline at its normal depth. `hks-selection` displays the count
and emits action intents; it has no document or program knowledge.

**Jumping to a section flies the camera there.** The navigator, with its map
open, lists the sections; clicking one emits a jump, and `main.ts` turns it into
a stream of `set-camera` actions. `flight()` in `shared/camera.ts` is van Wijk
and Nuij's smooth zoom-and-pan: one curve that pulls back, travels and closes in,
pulling back further the further it goes (`RHO`), with a duration that grows
with the **root** of the path's length, from 0.7 s up to a 2 s cap. Linear, as
it first was, a short hop was over in a blink and a jump across the canvas was a
wait; the root gives a hop time to read and keeps a long way brisk. `animationFrames()` drives it through `switchMap`, so a
second jump replaces the first, and `takeUntil` any pan, zoom or key ends it, so
the user can always take the camera back. A flight reads the camera from the
fold it feeds, so it reaches that fold through the workspace actions `main.ts`
defers into history, like window gestures.

**Locating a window flies there too.** A jump is a `Jump`, a section or a
window, and both run through the one `flights$`, so a locate is interrupted by
a pan like any flight and a second jump replaces the first. A window's target is
`centredOn(IDENTITY, …)`: centred at 100%, zoomed out only as far as it takes
to fit, because where the view stood says nothing about how to read the window.
The same `locate` input also raises the window, as a plain `raise` beside the
flight. The state map's locate buttons are the first to send it.

**Sections are also slides.** With nothing editable focused, ←/→ and
PageUp/PageDown step to the previous or next section in reading order (top to
bottom, then left to right). `steppedSection` in `src/commands.ts` decides from
the camera alone: if the view's centre is inside a section it steps from there,
otherwise it goes to the nearest one first. A step is just another jump, so it
flies, and a pan cancels it like any other flight.

**The navigator** (`hks-navigator`, bottom right, in the chrome slot) is one
expanding card. Its compact pill keeps the slotted launcher, State, a live minimap thumbnail
and the zoom readout; clicking the thumbnail expands the same surface upward, keeping
its bottom-right anchor. State and undo/redo sit in the upper corners; zoom,
fit, section creation and collapse sit along the lower edge. Section names are
keyboard-accessible jump buttons on the map, not a separate row of chips. Each
section is **one** button over its bounds, holding its area as an SVG path; the
button takes no pointer events and the path does, so hover lights the whole
shape and a click in an L's empty corner falls through. A button per rectangle
lit only the piece under the pointer.

`minimapOf` in `navigator.ts` maps every window frame and the visible world rect
into a fixed coordinate system with one uniform scale. The component draws those
rects in an SVG and scales the section hit targets by percentage. Keep their
aspect ratio in sync with `MINIMAP`; the compact and expanded views share one
scene and do not rebuild controls on expansion. The open state still lives in
the workspace fold (`toggle-minimap`), and the component only emits gestures.
Hidden expanded controls leave the tab order. The direct Navigation card story
covers compact, expanded and empty states alongside the workspace composition.

Slotted children stay in the light DOM: `mountChrome` appends them to the
canvas with a `slot` name, and their own shadow roots are untouched. Everything else is a
window in its own right — a control that belongs to the sketch conceptually is
not therefore part of its window chrome, and the timeline learned that the hard way.

## Windows

Windows live on an **infinite canvas**. `hks-canvas` holds a `.world` layer
transformed by a `Camera` (`screen = world * zoom + (x, y)`); windows are
appended as its light-DOM children, so the transform and the appearance's custom
properties reach them, and a frame is in world units. Drag the background or
wheel over it to pan, ctrl/cmd+wheel (a trackpad pinch sends the same) to zoom
around the pointer, ctrl/cmd `=` `-` `0` from the keyboard, and the navigator has
zoom, reset and fit. A plain wheel over a window is left alone, so textareas
still scroll.

**Touch pans and pinches from one fold.** `touchGesture$` in `shared/drag.ts`
folds every touch pointer with `reduceTouches` (`shared/pinch.ts`): one finger
pans, but only if it went down on the ground; two fingers pan by their midpoint
and zoom by their spread about it, wherever they went down, so a pinch over a
window still zooms the canvas; a third finger waits until one of the first two
lifts. A two-finger move is emitted as a pan **then** a zoom about the new
midpoint, which is what keeps the world point under each finger exactly under
it. The mouse pan takes `notTouch`, or the first finger would pan twice.
**A touch something already took is not the canvas's**: the adapter skips any
`pointerdown` that is `defaultPrevented`, which every drag gesture (a title bar,
a slider, a paint stroke) already does, and a view with a camera of its own
claims its touches (`claims`), as the state map does, so a pinch over the map
zooms the map, not the canvas. The canvas host is `touch-action: none`, so the
browser never pinch-zooms the page under it. That does not stop a finger
scrolling a window's text areas and lists: Blink allows panning again at every
scroll container, whatever its ancestors say, which real touch events through
the DevTools protocol confirmed (the formula editor's text area scrolled, the
canvas stayed put). Safari has not been checked on a device. The dot grid is a CSS gradient whose size and offset follow the
camera, coarsened in powers of two as you zoom out — there is no grid DOM.
The canvas clips overflow with `clip`, not `hidden`: a hidden overflow box is
still a scroll container, so browser focus can scroll it and displace the world
without changing the camera. Program contents own their own scroll containers.

**Window deltas are divided by zoom in the reducer**, not in the window: the
pointer moves in screen pixels and the frame is in world units, and doing it in
`reduceWorkspace` keeps the camera and the frames in one `scan` with no
`withLatestFrom`. Sliders inside windows read their input through
`getBoundingClientRect`, which already includes the transform, so they work at any
zoom; their layout reads `offsetWidth`, which does not, and that is also right.

A sketch window renders at `devicePixelRatio * zoom`, stepped to 0.25 by
`steppedRatio` so a wheel zoom does not reallocate a target on every tick, and
capped at 2048px a side (`pixelsOf` in `engine/moment.ts`). Stepping alone was
not enough: a ctrl+wheel zoom still crossed a step every few ticks, and at the
cap each reallocation took 50 ms. So `viewRatio$` waits until the zoom has
settled for `SETTLE_MS` (150 ms) before it emits, and in the meantime CSS
scales the last picture; the first value applies at once, or a sketch would
open late. The window's moment (`windowShowing$`) carries its **scale**, pixels
per sketch unit, so the engine sizes its dots as the window would; a pedal's
moment carries none, and the engine frames the sketch at the reference side.

Windows drag by their title bar, resize from any edge or corner, and raise on
click. `HksWindow` adds the eight handles itself, so the frame is described
in one place rather than in four templates; they straddle the border by half
their width, so grabbing an edge does not demand pixel accuracy. A west or north
drag moves the window as well as sizing it, and the clamp has to agree — `x`
shifts by the width the minimum actually allowed, or the far edge creeps while
you push against the limit. All of that is one pure reducer — `reduceWorkspace`
in `workspace.ts` — folded over a stream of `WorkspaceAction`s with `scan`. There is
no `dragging` flag, no `offsetX`, no z-index counter: depth is read from the
stacking order, and the per-gesture `pointerDelta$` in `shared/drag.ts` supplies
the deltas. Pairing has to happen _inside_ the gesture; pairing the flattened
stream would make the first move of each drag jump from wherever the last one
ended.

**Windows snap and attach.** Dragging a window within 10 screen pixels of
another's edge snaps it flush or aligned, and wherever two windows touch,
`hks-seams` puts a pill on the middle of the shared edge, oriented along it like
the iOS drag handle — faint while unattached, longer and in ink once attached —
inside a larger transparent button that is its hit area. Clicking it toggles the
link. Linked windows form a group:
moving one moves all of them, and raising one raises all of them, the dragged one
on top. **Resizing an attached edge carries what is attached there**: a linked
window on the side being resized (`sideOf`, judged as seams are) moves by exactly
as far as that edge moved, with everything linked on from it but not back
through the resized window, so growing pushes it and shrinking pulls it and the
link survives the prune that follows. Those windows are left out of the resize's
snap targets, or the edge would snap back to the window it is pushing and never
move. Windows attached on the other sides stay put, and the edge still snaps to
them, so a window stacked under another locks to its width. **A resized edge
snaps to every window beside it, linked or not**, by the rule a move uses: near
in the other direction (within reach), judged from the box **as dragged**, so a
corner that grows up to a neighbour counts it. Snapping only to linked windows
made it depend on what happened to be attached, and judging from the box before
the drag missed whatever a corner was growing towards. Closing a window
closes only that one.

All of it is the one `scan`. `Workspace.links` holds `{ a, b }` pairs, and a group
is `groupOf`'s connected component, never stored, so it cannot fall out of step.
`reduceWorkspace` prunes every link whose windows no longer touch after **every**
action, which is how quitting, resizing apart and a stale stored link all drop
out with no case of their own. That pruning is also why a pill can
never be stranded: a link exists only where its seam is drawn.

Snapping has a trap. A move delta applied to an already snapped frame would keep
snapping back, and the window could only escape with one big jerk. So the reducer
keeps `drift`, what the last snap held back, and adds it to the next delta;
pulling away accumulates it until the snap lets go. A drag always begins with a
`raise`, which clears `drift`, so one drag never inherits another's.

Snapping and seams use `Process.measured`, not the frame: a window whose content
will not shrink below its own minimum can lay out larger than its frame. Every window reports its laid-out size as a `measure` gesture from
`observeResize$`, read with `offsetWidth`, which is in world units because it
ignores the zoom transform. `fit`, `reveal` and the minimap read `boxOf` too. A resize grows
`measured` along with the frame rather than waiting for the next `measure`,
because the next snap in the same drag reads it before the observer has fired.

**A gesture starts on the element and ends on the document.** `pointerdown` is
the element's, but the moves and the `pointerup`/`pointercancel` that close it are
the document's, filtered by `pointerId`. `setPointerCapture` is an optimisation,
not the mechanism — it is wrapped in a `try`, so if it ever fails and the ends are
watched on the element, the release lands somewhere else, `takeUntil` never fires
and the gesture stays open forever. The window then resizes on hover the next time
you cross that border, with no button held. Do not move those listeners back.

**The window decides the sketch's size; the canvas fills what is left.** The
sketch was once the one `fitted` window, its frame holding the canvas size and
the window wrapping around it, which made the window the content's servant and
gave every window a branch for it. Now the sketch is an ordinary window. Its
viewport is the flex item that takes the space the controls leave, and
`HksSketch.sizes$` reports that space from a `ResizeObserver`, read with
`clientWidth`/`clientHeight` — world units, since they ignore the canvas zoom.
That is the sketch's `size$`, so switching tabs, which changes how tall the
controls are, reshapes the canvas, and the export summary and thumbnails follow
the new aspect. The canvas is `position: absolute` inside the viewport: in the
flow it would hold its own viewport open, and the window could grow the drawing
but never shrink it. The minimum (320 x 420) leaves room for the controls.

**The whole app is one snapshot.** `state-store.ts` writes a single versioned
`hakase.state`: the workspace (processes, links, camera, toolbar), the look and
its edits, formula and theme edits, duration, loop, where the playhead last
rested, every window's settings, and every ticket state. `persistState$` takes one `combineLatest` of
the folds, each reaching it by exactly one path, debounced: a drag emits on every
pointer move and storage only needs where it stopped. That is hygiene, not
speed — a write measures about 2us for a 168-byte payload, so do not go looking
for it in a profile. `restoreState` reads it once at startup and every fold is
seeded from it with `startWith`, so restoring is the same mechanism as starting
fresh. If the key is absent it reads the two keys it replaced, `hakase.workspace`
and `hakase.appearance`, so an upgrade keeps windows and look.

What is **not** saved is anything derived or momentary: diagnostics (recompiled),
measured sizes (re-measured), snap drift, the pointer, and whether playback is
running — a reload never starts moving on its own. The playhead is saved where it
last **rested**: `rested$` keeps the position from the last moment playback was
stopped, so a running clock does not keep the debounce from ever settling.
Settings of closed windows are dropped when written; ids are never reused, so
nothing could read them.

Every part is untrusted input and parsed on its own, field by field with a
default for each (`parseWorkspace`, `parseSettings`, `parseTheme`,
`parseAppearance`), so one bad or outdated part falls back without discarding
the rest. There is no window clamp any more: on an infinite canvas a window
saved off screen is one pan or one **fit** away.

`viewportSize()` in `lib/dom.ts` is the only place that knows `innerWidth` reads
0 in an embedded frame before first layout, and it replaces only that zero, not a
small screen — flooring a real size makes fit and launch centre on a point
outside the window. `viewport$` in `lib/rx.ts` follows resizes; sample it rather
than the window.

`src/styles.css` is page-level only: body sizing and the base font. It holds no
palette — the appearance does, applied on the canvas host.

**A panel that can cover a control must be dismissible and closed by default,
and must not take pointer events while closed.** Overlapping the canvas is
harmless; a panel over a slider swallows its `pointerdown` and the control goes
dead with no error anywhere. A sketch's parameters panel is collapsed by default
for this reason.

## Undo: one log for every document

**Every document is one fold, and the state is its log, folded.** The
workspace, settings, tickets, notes, agendas, habits, world clocks,
bookmarks, signals, the formula library, formula text, themes, appearances and
the look are one `Documents` record (`src/documents.ts`), folded by one `scan`
over a union of `DocumentAction`s; `tickets$`, `waves$` and the rest are
projections of it, so their readers never changed. Clocks are not documents —
playback, focus timers and diagnostics keep their own folds — and neither is
anything only looked at. The reducers are what they were; `reduceDocuments`
dispatches to them. Because every document changes in one reducer:

- **A fork and its copy are one step**: the workspace's new store and the copy
  into every document of it happen in the same reduction, so one undo takes both
  back. (Timers and playback still copy from the workspace's `pairwise`.)
- **A prune is undoable, data and all**: the registry and the documents are
  pruned in one step, and undo brings both back.
- **A signal source that would loop is refused against the state it would
  change**, in the reducer, rather than by a fold reading itself through a
  `defer`.

The log (`src/timeline.ts`, generic, knowing nothing of documents) keeps
**steps**, each with the actions that made it and the state after it as a
checkpoint, so undo, redo and travel are instant. A `Kit` tells it how: the
reducer, how an action forms a step (`stepOf`), its label, what a jump in time
keeps where it is, and how an action is settled. Steps join and break as they
always did — one drag is one step, a `raise` ends it, and a gesture that arrives
as many commands (a note being typed, a card being edited, an agenda block
dragged, a signal dragged, a formula, theme or appearance edited, a window's
settings) joins per key. Actions that are not steps (camera, raise, measure, a
view-only setting) are still applied, and logged with the step they follow, so
a replay reproduces them; a jump keeps the view (`keepingView`) and hands every
restored edit back with `from: null` (`keptDocuments`), or its writer's editor,
which skips its own echoes, would never show it.

**Any step can be taken back, not only the last.** The History window's ↶ on a
step folds the log again without it, from the checkpoint just before it, and
records that as a step of its own ("Took back …"), so it is undone with ⌘Z like
anything else. Two rules make a replay without an earlier step land the same,
and both are about an action carrying what it depends on:

- **Ids travel with actions.** Every logged action has a sequence number, and a
  reducer names what it makes from it (`sketch-41`, `card-57`), not from a
  counter in its state, which a replay without an earlier step would number
  differently, and every later action naming that id would miss. Counters stay
  for names, and are the fallback when a reducer is called
  outside the log (the tests). The document reducers take the sequence as
  `{ seq }`, never a bare number: handed to `Array.prototype.reduce`, a number
  parameter takes the index. The sequence is saved; an older save starts above
  every counter it holds (`seqFloor`), so no new id meets an old one.
- **What an action reads is settled when it happens** (`settledAction`): a
  launch carries the camera it was opened under, a move or resize
  the camera its pixels were measured in, a new section its view. The reducer
  looks at those actions through the camera they carry.

Replaying only the step's own actions matters too: a raise or a pan that
followed a taken-back step is still replayed. Old steps are compacted into the
base past 100, never between a step and the step that took it back.

**Editors must measure a restore from what they had, not what they wrote.**
Each editor skips its own echoes; the old folds remembered the last value they
had _written_ and deduplicated against it, so an undo of the user's own typing
back to that very text compared equal and never reached the textarea.
`seenBy` in `program.ts` tracks what the editor _had_, own edits included, and
the formula editor's component no longer deduplicates its presets.

**Settings that only move the view are not steps** (`viewOnly`): a sketch's
orbit, tab and strip zoom, the state map's camera, which note, day, formula or
theme an editor shows. A window's first change is measured from its program's
defaults, or opening a tab would count as an edit.

Labels are read against the documents before the step, so a close can still
name what it removes. The **history** program lists the steps oldest first, the
present marked, the redo side greyed and taken-back steps struck through; a
click travels, ↶ takes back. The navigator's undo and redo are disabled while
their side is empty, read from the same fold. The history is not saved: a
reload starts at "Opened the app". ⌘Z and ⇧⌘Z (or ⌘Y) come from the canvas's
`edits$`, which ignores keys whose `composedPath()[0]` is editable — a textarea
inside a shadow root is retargeted to its host, so `event.target` alone would
steal the editor's own undo.

## Stores: shared or separate state, per window

Every program's state lives in **named stores**, and every process is **bound**
to one store of its own program (`Process.store`). Two windows bound to one
store share their state; a window on a store no other window uses has its own.
"Shared document" and "per-window settings" stopped being two mechanisms: they
are the same one with a different default binding at launch.

- **`HOLDING` in `stores.ts` is the one table** that says, per program, what its
  store holds and what a new window binds to. A program with a **document**
  (tickets, notes, focus, agenda, habits, clocks, bookmarks) binds the
  document and shares the main store, whose id is the program id; its window
  settings (which note, which day) stay per window, or two windows on one notes
  store could never show different notes. A program with only **settings**
  (sketch, formula and theme editors) binds those, and each new window gets a
  store of its own. Timeline, playhead, tasks and appearance hold nothing: no
  store, no chip.
- **The registry is workspace state**: `Workspace.stores` names each store, ids
  `store-<n>` come from a monotone `made`, and binding, splitting, renaming and
  removing are ordinary undoable workspace actions, emitted by the window as
  untagged gestures and stamped in `liveProcess$`. Which windows share a store is
  derived, never stored, and so is its colour (`colourOf`). A store a launch
  made for one window is pruned once no window uses it, like a link; naming it or
  splitting one off keeps it.
- **Programs never learn stores exist.** `liveProcess$` stamps every input with
  the window's binding as it leaves (`withLatestFrom(self.store$)`, which
  subscribes to the binding first, so nothing emitted on launch is lost), the
  documents fold keeps each document as a map by store, and `scoped` hands each program an
  `AppState` already narrowed to its store with a `switchMap`. Rebinding swaps
  the stream, and the components already update in place by id. Global state
  stays global: playhead, transport, look, formulas, themes, library, tasks.
- **Splitting off copies once.** A new store carrying `copy` is filled in the
  same documents step that made it, and only if it has no content yet, so undo
  and redo cannot overwrite what was done since. Timers and playback, which are
  not documents, copy from the workspace's `pairwise`; a copied focus timer
  starts paused.
- **A main store is always saved**, window open or not: it has no registry entry
  until one of its windows opens. Saving only registered stores once dropped
  every document of every program that had no window open.
- Documents are saved `{ byStore: {...} }`; one saved as a single value becomes
  its program's main store, and a window saved without a binding gets its main
  store, or its own id when private, which is what its settings were keyed by.

The window shows its binding as a **chip** left of the close button: the store's
colour and name, outlined when another window shares it. Clicking opens a
popover listing the program's stores with how many windows use each, × on
unused stores, and two icons in its header: **+** for a new empty store and
a **fork** (a branch) for continuing on a copy of this one. The icons carry a
`title` and an `aria-label`, because a glyph alone does not say which is which.
**The current store's name is an input in its own row**: switching to it would
do nothing, so a click there renames instead, Enter commits and Escape puts the
old name back before the blur, so the blur changes nothing. The list is not
rebuilt while a name has focus, or the rebuild would take the input away.
**+ and fork keep the popover open** and focus the new store's name, selected,
so it can be named at once. Which store is new is read against the binding as it
was in the **capture** phase: the window's own gesture listener may already have
applied the add by the time a bubbling listener runs, and waiting for "the next
binding" then waits forever. The window
receives them as plain `StoreOption`s and knows nothing else.

## Signals

`signal` is a document program: a low-frequency wave, `Signal = { shape, rate,
phase, offset, depth, steps, glide }`, with `signalAt(signal, t)` a **pure function of the
playhead** (`src/shared/signal.ts`, shared because the sketch reads it too).
That is what keeps a signal honest about time: it loops seamlessly, a scrub
lands exactly, and an export or a thumbnail evaluates it at its own frame with
no recording. Rates are whole cycles per loop (`RATES`), for the same reason as
knob motion; `noise` eases between hashed points whose index wraps at the
loop's point count, or its last point would jump back to the first.

**A signal is set like an LFO, and it is not bounded.** It swings `depth` either
side of `offset`, both any number (a negative depth flips it), so it can output
-5 to 30 as easily as 0 to 1; only the phase wraps, as a fraction of a cycle.
It was first `low` and `high` clamped to 0 to 1, which made it a knob value and
nothing else; `parseSignal` still reads a saved low and high as the same wave,
and a source that followed `high` as one that follows `depth`. Offset and depth
are also what chaining wants: a slow signal on another's depth is amplitude
modulation, on its offset a drifting centre.

The window is built like an instrument rather than a form. The scope fits
itself to whatever the wave reaches and labels its bounds, and the wave can be
**grabbed**: up and down moves the offset by the plot's span, left and right
slides the phase by the cycle (`drag-wave`, as fractions of the scope, so the
fold does the scaling). Shapes are glyph buttons and rates a row of chips. The
three values are **drag-numbers**: drag up or right to raise one (shift is ten
times finer, `dragStep`), a click without a drag opens it for typing (degrees
for the phase, `typedValue`), the arrow keys nudge it. A drag is reported as a
`nudge`, how far, never as a value read from the field, because a control must
not reach for the value the fold owns. A field being typed into is not written
over, and leaving it writes the fold's value back, which is how Escape and a
refused entry restore it.

**A step sequencer is a shape, not a program.** `steps` reads the wave from a
table of 4 to 16 values in 0 to 1 (`STEP_COUNTS`), each held for its share of
the cycle and, with **glide**, easing into the next over the last part of it,
the last step into the first so a loop still loops. Offset, depth, phase and
rate apply to it like any other shape, so it chains, drives knobs and is saved
and pruned with no code of its own. A separate `sequence` program was weighed
and dropped: every input, the follow kinds, a second fold, its parser, the
prune and every chain lookup would have had to know two kinds of modulator for
what is one more way of drawing a wave. The table and glide stay on a signal
whatever its shape, so switching away and back keeps them. They are edited
in a bar strip shown only for that shape (`data-only`, like the sketch's
mode rows): a stroke is reported as `draw`, from and to as fractions of the
strip, and `drawn` sets every step between the two, so a fast stroke leaves no
gaps. Changing the count resamples the table rather than clearing it. The step the
playhead is on is lit (`stepAt`, after the phase, modulated or not), in the same
pipe that builds the bars: two pipes, one rebuilding and one marking, could
leave a rebuilt strip without its mark. Glide is
a fourth drag-number, a `Field` but not a `Param`, because it cannot follow
another signal.

A signal window shows its wave and marks the moment of the clock it follows
(it takes `playbackInput` like a sketch). A sketch's four knobs are store
inputs (`knobInputs`, optional, accepting a signal, a gate or a converter), so one
signal can drive knobs in several sketches, and a fork drives another set apart. A signal never reads the
clock of the window that shows it: the follower evaluates it at its **own**
playhead, so a sketch on a second clock plays the same wave on its own time.
`AppState.followedWave$(input)` hands a program the signal its input is bound
to, or null, with its whole chain already resolved.

**A sketch's scene can follow signals too**, and every input takes the signal's
value **as it is, in its own unit**: a knob gets the raw value (a hand-set knob
stays 0 to 1, a signal can push it anywhere); `turn` and `pitch` are in turns,
added to the viewer's own drag; `distance` replaces the dolly; `focus`, `dot
size`, `depth` and `trails` are the setting itself; and `colour` is an offset
along the theme ramp (`uColourShift`, added to the tint before the lookup).
Rescaling per input, as they first did, only made sense while signals were stuck
between 0 and 1. A value is clamped only where the picture would break: focus to
0.1 to 10 so the lattice cannot collapse, pitch and distance to the orbit's own
limits (`clampedOrbit`), trails below 0.97 so a frame still clears, dots to
sane sizes. Lattice density is deliberately not an input: it sizes the state
textures, so moving it every frame would rebuild them every frame.

They are optional inputs like the knobs (`sceneInputs`) and travel in the same
`PanelParams.signals`, keyed by `DRIVES`. All of them are read every frame —
`setMoment` sets the orbit, focus, colour and dot uniforms, which `prepare` no
longer touches, and `drawFrame` reads `trailsAt` — because they change with the
playhead; both are shared by the live sketch, the thumbnails and an export, so
all three see the same frame. A driven slider (focus, dot size, depth, trails)
keeps its value for when it is let go, disabled, with the readout saying
**follows** and the value it is playing (`follows · 3.6`). `liveReadouts` reads
those from the same functions the renderer calls, at the window's playhead, and
the program follows the playhead for it only while something is driven, so an
undriven sketch does no work per frame for its readouts. **A still must let go of a driven trail too**: thumbnails and a
saved frame used to drop trails with `trails: 0`, which a driven trail would
override, so they go through `withoutTrails`, and an export's warm-up loop asks
`hasTrails`.

**A signal's phase, offset and depth can follow another signal** (`Signal.sources`),
so an LFO can swell another's range. The followed value stands in for the
parameter, evaluated at the same moment, so a chain still loops and still
replays exactly. Three choices hold it together:

- **The sources belong to the signal document, not its window.** A knob follows
  a signal _store_, so a window's inputs could never reach it, and closing the
  window would silently stop the modulation. `signalProgram.inputs` declares
  phase, offset and depth with `from: 'store'`: the state selector edits the
  selected signal's sources, and the state map derives its store jacks from the
  same definitions. These inputs never enter `Process.follows`. Both interfaces
  feed the signal fold, which rejects cycles before applying a source command.
- **Rate cannot follow.** It is a whole number of cycles so a loop loops, and a
  moving rate would not be one.
- **A loop cannot be expressed.** The documents reducer refuses a source that
  would reach back to its target (`closesLoop`), against the very state it
  would change. `waveOf` also stops at a store
  already seen up the chain, for a loop that arrives through storage.

`waveOf` resolves a store into a `Wave`, a signal with its followed parameters
as waves, and `waveAt` evaluates it; `sameWave` compares by each signal's
reference, so an edit elsewhere does not re-prepare a sketch. **A prune keeps
what kept signals follow**: both the registry step and the folds' `keep` take
`reachedFrom` the bound stores, or a signal that only feeds another would be
deleted out from under it.

## Progress

`progress` shows what a timer or a plan is doing: a bar with a title, the time
left and the span, following a focus timer (its phase, or the block it follows),
an agenda (the block now, or the next one, named, with an empty bar) or tickets (a `count`: how many are done of how many). It is a separate program from
the dial on purpose. The dial once followed focus too, read-only, and it looked
like a disabled control; and a reading has more to say than a fraction — a
name, the time left, what comes next — which a scrub control has no room for.
So a control scrubs (`playhead`) and an indicator reads (`progress`), and they
share no type. A saved dial that followed focus falls back to its main clock.

A source is read into a `Reading` (`now`, `next`, `count` or `none`) by pure
functions in `src/readings.ts` (`agendaReading`, `focusReading`, `ticketsReading`), and `barView` turns that
into the text and fill the component applies. The agenda's reading moves with
the wall clock, which reaches `inputs.ts` as `InputSources.now$` rather than an
import: the input definitions are plain data the tests load, and `lib/rx.ts`
touches `window`. A new readable kind is a source with a `read`, a case in
`readingOf`, and one entry in `sourceInput.sources`.

## The plot

`plot` draws signals as curves over the loop, like an oscilloscope: four optional inputs, `a` to `d`
(`plotInputs`, grouped as Signals so state mode folds them), each drawn as a
line over one loop in the colour of the state it follows, the same colour its
wire and chip wear. A cursor marks the playhead of the clock it follows, with a
dot on each line and the value in the legend; a chained signal is drawn as it
plays, modulation included. **Overlay** puts every line on one fitted scale,
**lanes** gives each its own band and scale (`lanesOf`, `boundsOf`,
`readingsAt` in `components/plot/plot.ts`). The layout is the window's only
setting, and a view-only one, so it is not a step. Dragging across the plot
scrubs its clock like the frame strip does. It keeps no state of its own
(`HOLDING` is null): inputs in, a picture out.

It reads each input through `followedSignal$`, which hands over the bound
store's name, colour and wave **together**, read from the one documents fold.
Reading `followedWave$` beside a separate name stream was the first version and
is the two-paths trap: a rebind changes both, and the legend would show one
signal's name over another's line for a frame.

## Paint

`paint` is a document program for pictures a sketch can read: a square of
16, 32 or 64 pixels of ink (0 to 255, row by row from the top, bytes so a
frame uploads as it is) and up to twelve **frames**, played across the loop,
held or faded one into the next (`Picture` in `shared/picture.ts`, shared
because the sketch reads it too). Strokes stamp soft discs (brush, erase,
soften) along the segment, so a fast stroke leaves no gaps, at every copy its
**symmetry** places (mirror, quad, three or six turns, kaleidoscope: six turns
mirrored); fill floods ink of like value; clear, invert, soften, noise and
shift act on a whole frame. All of it is `reducePicture`, pure, and noise is
seeded from the log's sequence, so taking an earlier step back draws the same
noise again.

**A stroke is one undo step**: its first segment carries `start`, which opens
a new step, and the rest join it, so two strokes in a row are two steps
(`stepOfDocument`). Brush, symmetry, the frame being worked on and the onion
skin are the window's own settings, view-only, so not steps; `painting.ts`
turns what the window saw into commands with them (`paintInputsOf`), and the
component never learns the settings exist beyond showing them.

**A sketch reads it through its `paint` input**, a new source kind. Each
surface keeps the picture as a `TEXTURE_2D_ARRAY` of R8 layers on its own unit
(`PAINT_UNIT`, 2: the palette is on 0 and a formula's state on 1), uploaded in
`prepare`, so thumbnails and exports get it too; `setMoment` sets which frame
the playhead is at. A formula reads `paint(x, y)`, 0 to 1 and bilinear, with
-1..1 covering the picture and its top row at y = 1; unplugged it reads 0.
**Relief**, **Stencil** and **Drift** are the worked examples: height, a
mask, and motion along the contour lines.

The window draws with plain canvases: the ink in the appearance's `--ink`,
pixel-crisp, over the previous frame in `--accent` (the onion skin), symmetry
guides as dashed rays and a cursor the size of the brush. A soften stroke
averages each pixel's neighbours, and that average is a plain loop: it ran on
an array per pixel at first and took 17 ms a segment at 64 with a big
kaleidoscope brush.

## Pen

`pen` draws a picture with signals instead of a hand. Its inputs `x`, `y`,
`size` and `ink` are store inputs (`from: 'store'`), like a signal's phase,
offset and depth, so they belong to the pen document and keep drawing with no
window open. It puts the pen where the signals say (`penAt`, y up, so a rising
signal moves it up the page; unplugged it goes round a circle), at the
symmetry's copies, with size scaling the line and ink its flow, which lifts the
pen at 0. **Whole** shows the finished figure, **draw** the line up to the
playhead, starting again with the loop; a sketch's `paint` input accepts a pen
as well as a paint store.

**A pen's output is a stroke, never pixels.** It was a `Picture` once, 24
snapshots of a 64-pixel square traced on the CPU, so a sketch could read it
with no new code: the line was blocky, ran ahead of the tip and caught up in
jumps, and every signal edit re-rasterised it. Now `strokeOf` walks the loop
and lays **dabs** (`shared/stroke.ts`: x, y, radius, flow and the moment each
is laid, in loop order), spaced by distance at a third of the radius, so a slow
pen does not pile hundreds on one spot. Nothing is stored or rasterised ahead:
`dabsAt(stroke, t)` is the prefix the playhead has reached, by halving, and
whoever shows the stroke draws that many.

**The dabs are drawn on the GPU, in one instanced pass** (`shared/gl/ink.ts`,
`dab.vert`/`dab.frag`), a soft disc per instance blended
`ONE_MINUS_DST_ALPHA, ONE`, which is the brush's own rule, ink + (1 − ink) ×
dab, in premultiplied colour and alpha alike. A dab thinner than half a pixel
draws fainter instead of being clamped, or a size signal could not thin the
line. Two readers share the pass, which is why it and `program.ts` live in
`shared/gl/`:

- **A sketch** draws the stroke into layer 0 of its paint texture (RGBA8,
  `INK_SIDE` = 512, through its own framebuffer) in `setMoment`, so the live
  sketch, the thumbnails, an export and every simulation step all see the line
  at their own moment. `setMoment` therefore takes the `Surface`, and so do
  `drawFrame` and `evolve`. The pass puts back every piece of GL state it
  touches — framebuffer, viewport, scissor, depth, blend, clear colour, program —
  because a simulation step or a strip tile may be mid-way through its own. The
  formula still reads `paint(x, y)`; it never learns which kind fed it.
- **The window** shows a sheet the engine draws (`sheetOf`, `sheet$`): the
  whole figure into a transparent layer once per stroke, the part drawn so far
  into another on every count, both laid onto the paper by `sheet.frag`, because
  the engine's canvas is opaque. The colours are the appearance's `ink` and
  `well`, read from app state as data rather than from CSS at draw time; the
  guides and the tip stay in the DOM above it.

## Voice

`voice` is the first sound: a synth whose `pitch`, `volume`, `filter` and
`pan` are store inputs, like a pen's, so the signals that draw and drive
sketches play it too, in time with the playhead. Each input takes the signal's
value in its own unit: pitch in **octaves above the root**, snapped to the
voice's scale (pentatonic, major, minor, chromatic, or free), so a steps signal
is a melody; volume a gain 0 to 1 over the voice's own; filter a brightness 0
to 1 (the cutoff sits six octaves above the note at 1); pan -1 to 1. A shape
(the `OscillatorNode`'s own names), the root note, glide and volume complete
it, and **pluck** strikes each new note and lets it decay where **drone**
holds one tone that follows the pitch.

**What it plays is a pure function of the playhead**, like everything else.
`notesOf` samples the loop into notes, each starting where the pitch moves to
another semitone **or the volume rises out of silence**: without the second,
a repeated note was one long note, and no tune with C C G G could be played.
A gate (a steps signal of 1s and 0s on volume) re-strikes a repeated note and,
left open, holds a long one; two slots of the gate per note at twice the
melody's rate do both. The note sounding at the loop's start is `carried`
when it began before the end, so `onsetAt` reaches back into the loop before
instead of striking it again at 0; and
`levelAt` turns a moment into a frequency, gain, cutoff and pan. Notes travel
with the sounding (`Heard`) into one `combineLatest`, never derived beside it,
or a change would reach the levels by two paths.

**Instruments strike notes of their own.** A voice's `instrument` is the
`synth` (the one oscillator above, which follows the pitch) or a preset from
`INSTRUMENTS` in `components/voice/instruments.ts`, plain data built from a
closed set of parts: oscillator **partials** with ratios and their own fades
(additive: the organ's drawbars, the marimba's partial near 4×), an **fm** pair
(Chowning's: a modulator at ratio × the note bends the carrier by index × its
own frequency, the index falling away; piano and bell), a **string**, and a
band-passed **noise** burst (the marimba's knock, the flute's breath), under a
volume envelope, an optional sweeping lowpass (pad, bass) and vibrato on every
oscillator's `detune`. A new instrument is one entry. With an instrument
chosen, the window's own oscillator is shut (`drive`) and its bus carries only
volume, filter and pan; the synth's own controls are hidden (`data-synth`).

- **Notes are scheduled ahead on the audio clock, never struck per frame.**
  `scheduled` (in `shared/schedule.ts`, pure, shared with the drum machine)
  looks `AHEAD` (150 ms) past the playhead each frame and lists the onsets in
  that window with their exact audio times, remembering how far it has
  scheduled so none is struck twice; through a wrap it carries on, after a
  scrub or a pause it starts afresh, and a note carried across the loop is
  never struck again. **It anchors once per run**: the first frame pairs an
  audio time with the playhead, and every strike after is placed from that one
  pair. Pairing each frame's playhead with the audio clock as read in that
  frame looked equivalent and wobbled by up to a frame, measured live at 0 to
  14 ms off the grid; anchored, twelve live onsets landed within a microsecond.
  Both clocks keep real time (measured), and the anchor is set again only on a
  jump, a new loop length, or a drift past 30 ms. Each strike builds its own nodes
  (`audio/strike.ts`) that stop and disconnect themselves, so overlapping notes
  ring on.
- **The string is a pure buffer, not a worklet.** Karplus–Strong (`string.ts`):
  a hashed noise burst circulating in a delay one period long, averaged and
  damped each pass, computed into a `Float32Array` and played as a buffer. A
  feedback loop of `DelayNode`s cannot be shorter than one render quantum (128
  samples, so nothing above about 345 Hz), and the buffer is deterministic, so
  a test measures its pitch by autocorrelation: within 5 cents at 110, 440 and
  880 Hz. The delay is the period less half a sample, since the average delays
  by half a sample itself; damping is set per note from `sustain` (seconds to
  fall 60 dB) with the average's own loss made up, or high notes died in a
  fraction of a second; and each string is scaled to one loudness after its
  first overtones have gone, since a short burst holds little of its fundamental.
- **Loudness is measured, not guessed.** Each preset's `gain` comes from
  offline renders (`OfflineAudioContext`, through the very `strike` code), so
  every instrument sits at the same RMS a moment after its strike; they came
  out within 10% of each other, from a spread of 6× before.
- **The envelope is one curve in two places.** `envelopeAt` draws what the
  audio draws (a linear attack, then `setTargetAtTime` approaches whose time
  constant is a stage's length over `STAGE`), so `heardAt`, what a sketch
  follows, flares and fades with the instrument actually sounding.

## Drums

`drums` is a drum machine: seven drums (kick, snare, clap, closed and open
hat, tom, cowbell) by 8 to 32 steps, each cell off, a hit or an accent, the
pattern played 1, 2 or 4 times per loop, with swing holding back every second
step by up to half a step. It is a document like a voice's, its `volume` a
store input a signal can swell, and it plays on its window's clock through the
same anchored scheduler (`hitsOf` turns the pattern into spans), each hit
synthesised the TR-808 way in `audio/hit.ts`: a sine falling from 160 Hz with a
click for the kick, high-passed noise over two triangle tones for the snare,
three quick bursts of band-passed noise for the clap, six detuned squares
through a high and a band pass for the hats, a falling sine for the tom, two
squares at 540 and 800 Hz for the cowbell. The bus has a compressor, so hits
struck together do not clip, and the gains come from offline renders, to a
drum machine's balance rather than one loudness: the kick leads, snare, clap
and tom sit a step under, hats and cowbell light. An Envelope reads a kit's
loudness (`kitCurve`): each drum's hit decaying by its own time, weighted so the
kick leads and the hats only shimmer.

**A stroke paints, and is one step.** A press cycles its cell (off, hit,
accent); dragging gives every cell it crosses that first cell's new value, as
an intent (`paint` with `like`), never a value the component read back from its
own cells. Cells a quick drag skipped are filled along the line (`between`),
and moves are hit-tested with the shadow root's `elementFromPoint` because a
touch keeps its first target captured. **The tap is sent at the first move or
the release, not the press**: the window raises on the press, after the grid
inside it has heard it, and a raise ends the step it follows, so a tap sent on
the press left the stroke as two undo steps. Making a raise spare a step its
own press had opened was tried in the log and broke window drags, which look
the same there.

**A sketch can follow a voice, through an Envelope.** A voice is sound, and a
knob takes a level, so an **Envelope** converter stands between them (see
"Typed ports and converters") and reads the voice's **loudness**: how loud it
is at each moment, so a struck note flares and fades exactly as it sounds. The envelope is
in seconds, so the level is sampled over the loop at the follower's own loop
length into a `Curve` (`voiceCurve`, `shared/curve.ts`), and the sketch's
drives became `Driver`s, a wave or a curve, read by `driverAt`: still a pure
function of the playhead, so thumbnails and exports flare on the same frames.
The Envelope's **pitch** reads the note instead (`pitchCurve`, octaves above
the root); the signal the voice follows still works on a knob directly. A driven
row reads **follows** now, since it may not be a signal. **Chladni**, in the
library, is the worked example: the melody picks the plate's mode, so each note
has its own figure, and the level shakes the plate and lights it on each strike.

**Sound is the window's, and only while it listens.** Nothing reads a voice
as data, so its output is a side effect of its open window, like a sketch's
GL draws, and two windows on one voice play it twice. **Listen** is view state
(not saved): a browser refuses to start audio outside a gesture, so the
`AudioContext` is created inside the click's own subscription, never on load.
It is one context for every voice (`context$`, `shareReplay` with refCount; a
page may hold only a few), closed a moment after the last voice stops so the
release fades are not cut off. Each listening window builds an oscillator →
lowpass → gain → panner graph in `voiceGraph$`, torn down with a short release,
and `applyLevel` sets each parameter with `setTargetAtTime` once per frame, so
a voice sounds only while its clock plays and goes quiet when it pauses.
Frame-rate updates mean a pluck can land up to a frame late; scheduling
ahead of the playhead is the next step if that is ever heard.

**Store inputs are one mechanism for every document that has them.** A
document with sources is `Linked` (`{ sources }`), and a `link` action is
checked once for every kind before it is routed to whichever program owns the
store (`ownerOf`): the store's program must declare a store input with that
param (`storeInputOf`), the source's program must be one it takes, and the link
must not close a loop over **every** linked map (`closesLoop` on `linkedOf`), so
a kaleidoscope cannot feed the colour map that feeds it. `reachedFrom`, the
prune and the state map read every linked map alike. A program whose own state
is not a linked document keeps its links beside it: a focus timer's in
`focusLinks`, a sketch's in `sketchLinks`. **A store something links to is
kept**, as a named one is: the per-action prune drops unkept stores no window
binds, and without this, closing a sketch's window would take its store out from
under the pedal reading it. Saved windows and blueprints whose follows now
belong to a store input are moved onto the store's link when read
(`formerStoreFollows`).

## Image cables

The render side works like a guitar rig: a sketch makes a picture, the picture
runs through a chain of **pedals**, and an **Output** shows or exports it. It is
the app's own idea, visible dataflow, applied to pictures, and four choices
hold it together.

**A cable carries a recipe, never pixels.** An `Image` (`src/image.ts`) is
pure data: `points` (a sketch's source text, panel, theme, orbit, drivers and
sheet), `pedal` (a pedal document, its theme, a driver per knob, and its input
images), or `none`. It is evaluated at the follower's own moment like a wave,
so scrubbing, looping and export stay exact. Pixels could not cross windows
anyway: every context is its own, and contexts share no textures.
`sameImage` compares by what is drawn, naming every field; `stagesOf` lists the
stages inputs first, each once however many cables lead to it.

**A stage is a document, not a window.** A chain must keep running with its
source window closed, so everything a stage follows is a store input:
`sketchLinks` for a sketch, `Pedal.sources` for a pedal. `imageIn(store)` in
`app-state.graph.ts` assembles a recipe from the store alone, out of the same
deduplicated streams the windows read (`driverIn`, `sheetIn`, `pedalIn`),
recursively through pedal inputs with a `seen` set against a loop from storage.
It is streams, not one pure `imageOf(documents)`: that would rebuild every
voice curve (960 samples each) on every window drag. `PEDAL_DEFAULTS` is one
object per kind for the same reason; a fresh default per read looks like an
edit and recooks the chain. A window reads a cable as `followedImage$(input)`
and its own store's picture as `image$`.

**One engine cooks for every window** (`src/engine/`). One offscreen WebGL2
context, `engine$`, made by the first viewer and released after the last like
the audio context. `cook(engine, image, moment, now)` draws each stage into a
target kept per store and size, and skips a stage whose recipe, `t`, `pass` and
pointer are unchanged, so two windows showing one chain draw it once per frame.
A points stage runs the sketch's own `prepare`, `evolve` and `drawFrame` with
its own `SketchResources` into a multisampled target with depth, resolved to a
texture; `prepare` runs only when the stage's settings change, and otherwise its
palette and paint are bound back, or trails would never survive a frame. That
is why `prepare` restores whatever framebuffer was bound rather than binding the
canvas, and why the engine rebinds its target after `evolve`, which does not.
Targets unused for three seconds are released. `view$` hands windows bitmaps at
most once a frame, in order (`concatMap`), and turns a failure into a message
rather than an error. The cache is a GPU resource inside the one effect, not
app state.

**A pedal is a row of a table.** `PEDALS` in `src/pedals.ts` gives each kind
its title, its image inputs, its knobs (range, step, initial) and its choices;
`pedalProgram(kind)` makes the program, `pedalInputs(kind)` its store inputs,
and `shaders/<kind>.frag` reads its knobs as `uKnobs[i]` in table order and its
choice as `uChoice`, the choice's index. A new pedal is one entry and one
shader. Pedals hold a **private document** (`HOLDING`: document, private), the
first: two kaleidoscopes are two stages, so each window starts its own store,
and `withMain` offers no Main for it. A driven knob plays the driver's value as
it is, kept inside the knob's range (`knobAt`). Feedback keeps its last frame
and swaps two targets; a new feedback stage takes its first frame from its
input, or it fades in from black and, paused, never catches up.

**Output** follows a cable (`in`, a window follow, since it is a viewer) and
exports it through the engine (`engine/export.ts`): an engine of its own per
export, each frame cooked and drawn at the export size, handed to the sketch's
WebM and PNG writers. A chain with feedback or trails plays the loop once
unkept first (`hasHistory`), and the moment's `pass` keeps that warm-up apart
from the kept frames in the cache, which would otherwise hand back the
warm-up's pictures. Its frame strip is the sketch's own `HksFrameStrip` and
strip maths, with tiles cooked by the shared engine (`engine/thumbnails.ts`): a
tile is one more size, drawn at an offset into the engine's canvas and averaged
down in one `createImageBitmap`, and a tile whose recipe and moment are
unchanged comes from the cache.

**A chain's picture has the app's aspect, not a window's.** The aspect is a
document like the look (`Documents.aspect`, one of `ASPECTS`, 1:1 by default),
saved and undoable, and picked in any Output's export panel; the panel hides
the row for a sketch, which its window frames. Every window showing a chain
(a pedal, an Output) asks for it at that aspect and one preview size
(`chainShowing$`), so the moment and therefore every stage's target is the same
for all of them, and a chain is drawn once a frame
however many windows show parts of it. A **Showing** pairs that moment with the
window's own pixels, the `slot`, and `presented` fits the picture inside with
the backdrop around it, like a monitor; an Output's strip and export take the
aspect too, so every window agrees with what is exported. Each window used to
ask at its own size: Light show then drew its chain about three times a frame
and played at 38 fps with 52 windows in view and the script idle; drawn once it
holds 60. Deriving one shape inside the engine from whichever windows asked
was tried first and dropped: a picture then depended on what else was open,
which no recipe said. A sketch's own window still frames by its own size
(`windowShowing$`): no chain shares that picture.

**The preview size is one for the app, derived from the workspace**
(`previewSideOf`, `AppState.previewSide$`): the widest pedal or Output window
in view, in pixels at the current zoom, rounded up to 256, 512, 1024 or 2048.
It sets only how finely a chain is drawn, never what. A fixed 1024 drew up to
twenty times the pixels a zoomed-out window shows and fell to 45 fps; a size
per window, even stepped, drew a chain once per step present and held 55; one
for the app holds 60.

The **Pedalboard**
starter is the worked example: Ripple folded by a kaleidoscope a saw signal
turns, recoloured Ember, into an Output.
**Light show** is the showcase, every pedal kind in one graph: a trefoil
turned by a saw, folded and fed back, and a vortex blurred by a kick drum's
level (an Envelope on the drum machine), screened together by a mix a sine swells, graded by a colour map whose
offset a saw cycles and whose amount a pattern gate strobes. Its plot draws the
four signals that move it.

## Logic

Gates are the smallest programs there are: each is a window over a one-bit
document, wired by store inputs like a pedal, and a selection of them can be
boxed into a **component** whose gates are hidden but still there.

**A gate is a row of a table.** `GATES` in `src/gates.ts` gives each kind its
title, its bit inputs (`bits`), its level inputs (`drives`, only compare's
`in`), its icon and summary: nand, delay, switch, pattern, compare, lamp,
pin in and pin out. `gateProgram(kind)` makes the program and
`gateInputs(kind)` its store inputs. Holding is `stage`, a private document,
so two NANDs are two gates. Everything else is built from NANDs, by hand.
There was a constant gate as well; it behaved exactly as a switch, so it was
folded into one, and a saved constant comes back as a switch with its bit
(`RENAMED`, `parseGate`, `progressBinding`).

**A gate window is as small as its content**: one line (its bit and the loop's
row, or a pattern's steps), two for a pin's name or a compare's threshold, at
the `size` its `GATES` entry gives. Its chrome is every window's: there is no
small kind of window. Such a window is too small for its jacks inside it, so
state mode puts them on its edges (below).

**A clock is optional for gates and components.** They take
`loosePlaybackInput`, which starts unbound: a gate with no clock is the circuit
as it stands, evaluated at one tick, so switches and NANDs work and
a pattern holds its first step, and the window shows its bit without a row. A
window with no clock stands at 0 with a pace of one tick (`STILL` in
`app-state.graph.ts`), so its program needs no case for it. A component boxed
from gates with no clock has none either.

**Time is ticks, replayed.** Each clock has `ticks` per loop (1 to 64, 16 by
default), set in the timeline beside the duration and routed like it. The
bits are not stepped as the clock runs: `circuitTable(gates, ticks, drivers)`
replays ticks 0 to n − 1 from nothing and returns every gate's bit at every
tick, so a scrub, a loop or an export reads a moment exactly, like a signal.
Within a tick the gates run in topological order; a **delay** reads its input
one tick before, and is 0 at tick 0.

**A loop must pass through a delay.** A NAND that feeds itself within a tick
has no answer, so the documents reducer refuses it, but a latch or a counter
needs a loop. Two things let exactly those through: `loopsOf` is the link
graph with every delay's input edge cut, and the reducer and the state menus
(`inputGroups`) check against it; and `readsTickBefore` skips the check
outright for a link **into** a delay. The state map still checks the plain
chain, so it does not light a drop that would close a loop through a delay.
A compare's level input takes a signal or a converter (`levelInput`), never a
gate: the table reads it while it is being made, so a gate there would wait on
itself.

**One table, shared and memoised.** `circuit$` gathers every registered gate
store (its document, or the kind's default), and `tableOf(ticks, seconds)`
keeps one table stream per pace, so a hundred gate windows on one clock share
one evaluation. Readers get the pace as `pace$` (seconds and ticks together,
one stream, so a ticks change cannot reach a combine twice). A gate's row is
also a `Driver`: `bitCurve` turns it into a step curve, so every knob, scene
input and pedal knob that takes a signal takes a gate.

**A component is a presentation, not an evaluation.** **Make component** in
the selection bar boxes a selection of gates and components with at least one
pin out (`canBox`). `boxed` in `src/boxes.ts` closes those windows, keeps
their stores (`kept: true`, renamed `<component>.<pin>`), and opens one `box`
window whose document lists them as `inner` drafts, the pins in reading order,
and `sources` that link every inner store, so the prune and `reachedFrom`
keep what nothing else reaches. Nothing is rewired: a cable into a pin in was a
link on that gate and still is, a lamp that read a pin out still reads it, and
`circuitTable` never learns that components exist. Nesting is therefore free:
a component in a selection is one more window, and **Open** (`unboxed`) puts
back one level, with ids from the log's sequence, never the saved ones, so a
component placed twice opens into two sets of windows. Both are one step.

The window (`hks-box`) shows the name and each pin's bit now and across the
loop. In state mode a component's pins **are** its jacks: `wiringOf` draws an
input jack per pin in, which edits that gate's own `in` link, and an output
jack per pin out, which is that gate's store, under the clock's row and named
from the gates (`links$.names`). `links$` carries the links, the loop graph,
the components and those names as one record, because two of them combined
side by side fired every reader twice per link.

A blueprint carries a component with its hidden gates (the held `boxes`,
relinked through `storeOf` like a pedal's sources), and a placed copy keeps the
stores' own `kept`, since a hidden gate has no window to keep it. The **Logic
primer** starter is the worked example: two patterns into a half adder of five
NANDs boxed as a component, two lamps, and a counter that is one NAND and one
delay.

Still open: a voice's or drum machine's inputs take signals only (they are
resolved through `waveOf`), so a bit cannot gate a sound yet.

## Typed ports and converters

**Every port has a type the user can see.** `PORT_TYPES` in `src/port-types.ts`
is the closed list (clock, level, bit, picture, sheet, sound, schedule, timer,
tasks, reading, and the documents only their own program reads: zones, notes,
habits, bookmarks, formula, theme, component). Each source kind says what it `makes` and each input definition
what it `takes`, on the definition itself, so a new input cannot leave its type
out. In state mode a jack keeps its state's colour and its **shape** is its type
(a circle for level, a square for bit, a ring with a dot for clock, a rounded
square for picture and sheet, a double ring for sound, a diamond for the plan
types), and every label names the type; the state menu names it beside each
input. `Socket.type` and `FollowGroup.type` carry it as plain strings, so the
components still know nothing of the list.

**Every program that keeps state names its output's type**, read by `madeBy`:
a source's `makes`, or for the programs nothing else reads (world clocks,
notes, habits, bookmarks, the formula and theme editors, a component's own box)
an entry in `OWN_TYPES`. Their output jack only binds another window of the same
program to that state, and no input takes these types yet, but an unmarked jack
read as "anything" when it meant "only its own kind"; they share one shape, a
tab, and `port-types.test.ts` fails if a program with a `HOLDING` has no type.
Each is also where a future converter plugs in, such as a time zone read as a
level.

**Only a conversion with nothing to choose may stay implicit.** `CONVERSIONS`
lists every one an input still accepts: bit to level (0 or 1), the three plan
documents to a reading (their own summary, for the progress bar). Sound to level
was the last to retire: a voice's loudness and a kit's mix were choices, so they
moved into the Envelope converter. `port-types.test.ts` checks that every input of
every program takes only its own type or one listed there, so a new hidden
coercion fails a test rather than slipping into `driverIn`. A conversion that
chooses is a **converter**: a program on the canvas whose choice is its setting,
so two followers that want two readings of one source use two converters, and
links stay bare store ids.

**A converter is a row of a table.** `CONVERTERS` in `src/converters.ts` gives
each kind its title, summary, icon, the type it takes and makes, its choices and
its size; `converterProgram(kind)` makes the program, under the launcher's
**Convert** category; `converterInputs(kind)` gives it `in` (any source that
makes the type it takes) and **read on** (`time`), so a converter read on a day
clock is one value like a signal. Every converter's document lives in one
`Documents.converters` map (`Converter`: kind, choice, `sources`), a private
`stage` store like a pedal's, so saving, forking, pruning, undo, blueprints and
`linkedOf` handle them all once. `CONVERTER_DEFAULTS` is one object per kind,
for the pedal defaults' reason. A converter's output is a source of the type it
makes (`CONVERTER_SOURCES`), and `convertedIn` in `app-state.graph.ts` has one
case per kind: what it reads through `in` and how its choice makes a `Driver`.
`hks-converter` shows the summary, the curve over the window's loop, the moment
and its value, and the choices; it takes a plain `ConverterView` from
`converterView`, rendered in one pass so nothing combines two paths.

**Timing** is the first: an agenda read over today as _in a block_ (1 while
one runs), _through a block_ (0 to 1 across each) or _before a block_ (0 to 1
over the hour before the next starts, 0 inside one), all from `timingCurve`. An
agenda is not a drive source by itself: a knob that wants your schedule follows
a Timing that follows the agenda.

**Envelope** reads sound: a voice's or drum machine's _loudness_ (`voiceCurve`,
`kitCurve`) or a voice's _pitch_ (`pitchCurve`; a drum machine has none and
reads 0). Both sample at the **reader's** loop length, so `convertedIn` takes
the follower's pace, as the hidden conversion did. It retired sound from every
level input. **Saved links migrate on load**: `enveloped` (`src/envelopes.ts`)
finds every sketch link, pedal source and compare input that read a voice or
drums, adds one Envelope store per sound (`envelope-of-<id>`, named after it,
reading its loudness, kept, with no window), and relinks through it; restore and
saved blueprints both run it, and `formerStoreFollows` lets an old window follow
of a sound through so the migration can catch it.

**Kit** reads one drum of a drum machine, its choice one of `DRUMS`: up at each
of that drum's hits at the hit's own velocity, falling away by its own decay
(`drumCurve`). Unlike the Envelope's mix it is unweighted, so a hat reaches as
high as a kick. `kitLevelAt` and `drumCurve` share `drumLevelAt`, so the mix and
a single drum cannot decay differently. A voice makes sound too but has no
drums, so a converter's `reads` can narrow its `in` below its type: Kit reads
only drum machines, and `null` (Timing, Envelope) reads everything of the type.

**Phase** reads a focus timer, which runs on wall time rather than a playhead,
so it is a level **as it stands now**: one value over the follower's whole loop,
a one-sample curve, the shape a "read on" link gives. _through_ is how far
through the phase (or the agenda block the timer follows) it is, _left_ the
rest, _focusing_ 1 in a focus phase or block and 0 on a break; all three come
from `phaseLevel` over the timer's own `focusView`, so the window and the
converter cannot disagree about where the timer is. It moves on each timer tick
and is deduplicated by value, so a paused timer redraws nothing.

**Done** reads a ticket list the same way, as it stands now: the share of its
tickets whose status is at the _done_ stage, the _active_ one (in progress), or
not done yet (_left_), counted by stage and never by a status's name, as
progress counts them (`doneLevel`). An empty list reads 0 in every choice,
rather than dividing by nothing. What typed ports make possible next is in
`backlog.md`.

## Blueprints

A **blueprint** is a creation kept to be placed again: selected programs, saved from the selection bar's **Save as blueprint**, listed in the
**blueprints** window and placed from there. It was called a piece; `RENAMED`
maps the old `pieces` window, and the snapshot is read from `pieces` when it
has no `blueprints`. It is a document like the formula library
(`Documents.blueprints`, saved in the snapshot), so saving, renaming, deleting and
placing are ordinary steps; one undo takes a whole placement back.

`blueprintOf` (in `src/blueprints.ts`, pure) captures the selected windows with frames
relative to their collective bounds, their settings, every store they keep or follow **and what
those follow** (`reachedFrom`, so a signal that only modulates another comes
along), the documents of those stores, the formulas they show (a saved formula,
or a built-in's edited text, as label and source), and the links among them.
Themes and the look are global and go by name.

**A clock goes only with a timeline window to play it.** A copied clock with
no transport could never be started, so a window following a clock that has
no timeline in the section is placed on the main clock instead. A clock that
does go carries its loop on its registry entry (`StoreEntry.clock`), because
the clock it was saved from may be gone by the time it is placed; `seeds$`
hands it to the clocks fold as the store first appears, the way `copy` does
for a fork.

**Placing makes a fresh copy, never a link.** `placed` names every store,
window from the log's sequence (`store-<seq>-<n>`), so a blueprint
placed twice is two copies, and rewrites every reference to the copies:
bindings, a signal's, pen's or voice's sources, the settings keys, the links.
A formula is matched against the library by its source and added only if it
is new. A copy of a program's Main store takes the blueprint's name, since it is
not that program's main store.

**Place picks the spot first.** **Place** starts **placing**, a mode, not a
step: a ghost of the section and its windows follows the pointer (centred
under it, `footprintAt`, in world units so the drop lands where the ghost was
drawn), a click drops it there and Escape or a right-click cancels. It is one
fold, `reducePlacing`, whose **dropped** state is what turns into the `place`
action: a drop read by one listener while another ended the mode would race,
the todo submit's lesson. The ghost is `hks-placement`, a screen-space overlay
in the chrome slot, under the navigator and toolbar so zoom and fit still work,
taking every other pointer event so nothing beneath is clicked by accident. It
carries `data-ground`, which the canvas reads as ground, so the wheel still
pans and zooms while placing. Nothing of it is saved or undone; only the drop
is a step.

A blueprint from storage is untrusted like the rest of the snapshot:
`parseBlueprints` reads windows with the workspace's own `processFrom`, stores with
`storeFrom`, settings and every document with their own parsers, and placing
keeps only windows that `ownsInputs` accepts.

**Some blueprints come with the app.** `STARTERS` in `src/starters.ts` are
plain `Blueprint` values with a summary, for organising a day: **Today**
(agenda, a progress bar on it, todo), **Focus session** (a fresh board, the
focus timer, a progress bar on it) and **Daily review** (a fresh note opened
on a review template, habits, todo). They are listed above the saved ones, and
cannot be renamed or deleted, like built-in formulas; `blueprintIn` is the one
lookup, so placing, the ghost and the history label all find them. Like the
formula registry they are never seeded into the document, so a starter changed
in code reaches every user.

**Canon in D is the starter that makes music**, and the worked example of an
arrangement built from the pieces above. Pachelbel's ground is a steps signal
(`GROUND`, semitones from D3) at rate 2; the harp's arpeggio is a four-step
shape at rate 16 whose **offset follows the ground**, so one table of root,
fifth, octave, fifth plays every chord; and the two violins are one line
(`LINE`) in two signals, the second at phase 0.5, which is the canon itself: the
same tune a turn of the ground later, in tenths below the first. `tune` turns a
table of semitones into a signal whose value is octaves above the voice's root.
Every voice is in D major, so the pitch snaps to the key. Its sketch is the
`canon` formula, a Chladni plate whose figure the melody picks, shaken by the
harp and bass levels and the drum kit, each through an Envelope window under
the sketch. `starters.test.ts` checks the notes each
voice actually plays, through `notesOf`.

**A starter may work on the main stores instead of copies.** A window on a
store the blueprint does not list keeps that id when placed, so Today shows
your todo list rather than an empty one; only what should start fresh (the
session's board, tonight's note) is listed and copied. A saved blueprint lists
everything it binds, so it still copies everything. `placed` registers a main
store a window lands on, as a launch would, or a main store never opened before
(habits) has no entry and its window no chip.

## State mode, on the canvas

**A window's state chip opens its state menu**, and nothing else: switching,
making, forking and naming a state, and choosing what each input follows, is
the everyday part of the app and must stay one click away. The chip once
entered state mode instead, and the menu became unreachable. **State mode is
entered from that menu's Connections button**, the navigator's State button,
or by holding W. Only a menu opened from state mode (an output's ⋯) holds the
mode on while it is open; a menu opened from the chip reports itself apart
(`menus$`), or opening it would switch the mode on.

In state mode every window exposes
its output and declared inputs as minimal jacks inside its frame. Hover or
focus expands a compact state selector inward over that window's content;
compatible targets expand during a connection drag. The selectors use in-app
lists, because a native dropdown can swallow W's keyup and leave a held mode on.
Their lists open upward or downward within their owning window. Drag between compatible jacks to connect, or choose a state in
the selector; both resolve through the pure connection rules in
`shared/connections.ts`, shared with the State program. Optional inputs offer
None, and a signal input never offers a source that would close a cycle.
Output-to-output connections bind a window to the source's state only when
both programs match. A dotted wire joins windows that share a state. Every wire
(`wirePath`, shared with the state map) leaves an output level to the right and
enters an input level from the left, even when the target lies behind its
source, so which end is which reads at a glance; a backward wire's pull grows with
how far apart the jacks are, capped, so both ends stay readable.

**A window too small for its rows wears its jacks on its edges.** When the
rows would not fit inside its frame (`inside` in `wiringOf`), its inputs line
up on its left edge and its outputs on its right, centred, each jack straddling
the edge, so a gate's wires meet it where a schematic's would. It is decided
from the frame alone, so a larger root size or touch rows can tip any small
window over, and its menus open downward at full height rather than clamped to
a frame they cannot fit in.

**Inputs come in groups, so a window's jacks always fit inside it.** A
followed input may name a `group` in its definition (the sketch's Knobs, Camera
and Look); a group of one is not a group. A closed group is one line with a
bundled jack (a second ring behind it), its name, how many of its inputs are
bound, and a chevron; it opens to its members, indented on a rail from that
jack. **One group is open per window**, which is what keeps the smallest sketch
(320 x 420) inside its frame whichever group is open, and is tested at that
size. Three rules make it feel right:

- **A closed group's wires still land.** Its members stay in the view as
  `hidden` sockets placed on the group's jack, so every wire has an end and
  the wire logic needs no case for groups.
- **A drag springs a group open.** Hovering a group's line while dragging opens
  it, but only if one of its members could take the wire (`hover`, resolved
  by `commandFor` against the view, never by the component); a drop inside it
  keeps it open, and anything else lets it close again (`settle`). The sprung
  group stands in for the window's own open one only for the drag.
- **Open groups outlive the mode.** They live in the session fold (`open`,
  `sprung`) beside the mode's locks, not in the component, because the layout
  that places every wire reads them. Closing the mode keeps them, closing a
  window drops its own, and nothing is saved.

The rows are rebuilt on every change, so they are appended in reading order
(window by window, top to bottom) for Tab to follow, and focus is restored to
the matching row afterwards, or a click on a group line would drop the
keyboard's place.

`state-mode.ts` derives the world-space sockets and wires. `hks-state-wiring`
owns their DOM, and compact output selectors offer a manage button for the
existing name, new-state and fork controls. States without an open window
remain available in the selectors and in the State program.

Hold unmodified **W** outside an editable field to reveal state mode temporarily.
Releasing W hides it once any drag or open selector has finished. The State
button pins it; Shift retains its sketch painting gesture. A pure session fold
tracks held, pinned and named interaction locks. Window blur clears temporary
mode, and closing a window releases its menu lock.

The mode is transient and independent of workspace history. Escape and the
State toggle close it; there is no Done button beside a window, which only
duplicated them and sat on top of the chip. Closing a selector or editing a component
never exits pinned mode. `sameWiring` compares the applied view field by field so
editing a signal's numeric values does not rebuild an open selector.

## The state map

`state` draws the app's dataflow as one graph, inspects any of it and prunes
what nothing uses. It replaced both the patch bay and the inspector, whose
windows come back as state windows (`RENAMED` in `workspace.ts`). Stores sit
on the left, windows on the right, with two kinds of wire between them. A window's **own state** runs
into its header (a thick wire: what the window reads and writes), and each
**follow** runs into the jack of the input it binds (what the window only
reads). Where they meet the chain shows whole: signal 1 edits Signal Main,
which drives sketch 1's k1. It holds no state and adds no behaviour: `patchOf`
in `src/state-graph.ts` derives the graph from the workspace and `inputsFor`,
`layoutOf` in the component folder places it, and every edit is an action the
window chrome already sends (`follow`, `unfollow`, `bind-store`), so the
reducer's checks, undo and labels all apply.

**A store can have jacks of its own**: a signal's phase, offset and depth. A store
sits one column right of the deepest store it follows, and windows right of
every store column, so a chain reads left to right (`depthsOf`). A wire into a
store's jack is a `source` wire; focusing a store lights both what follows it
and what it follows. A store a used one follows counts as used, the same rule
the prune keeps by.

**The map is a small canvas of its own.** Drag a node's body to move it, empty
space to pan, the wheel to pan and a pinch (ctrl/cmd+wheel) to zoom around the
pointer; **Fit** frames every node and **Tidy** forgets the moves. A wire still
starts only at a jack. The camera maths is the canvas's own (`panned`,
`zoomedAround`, `centredOn`), and `wheelGesture` moved to `shared/wheel.ts` once
the map became its second reader. The map claims its wheels with
`preventDefault`, so the canvas behind skips them, the frame strip's contract.

What a window has arranged is that window's `StateMapSettings`: the camera, and
`positions` for **only the nodes moved by hand**, keyed `store:<id>` and
`window:<id>`, so a node never touched keeps its automatic place as the graph
grows. `layoutOf(graph, spots)` lets a spot override the automatic one and
derives every anchor and wire from the result, so a wire follows its node. A
move is a delta in the map's own units (read through the board's scale, which
includes both zooms) added to where the node is drawn now (`placedAt`), folded
with `withLatestFrom` over the window's settings. Spots come from storage, so
they are looked up by entry, never `spots[key]`. The board is sized to reach
every node even though the camera moves it: the pointer maths reads its scale
from its box, and a box of no size has none. Focus listens on the viewport, not
the board, or a press on empty space beside the board would never clear it.

A state window that has never been arranged (its settings still undefined) fits
its graph once, on its first layout with a real size; after that its camera is
what the user left, and a reload keeps it. A drop that the reducer would refuse
because it closes a loop is not lit while dragging: the map's own `closesLoop`
reads the chain from its `source` wires, the same reachability as the fold's.

**Every store is a node, private ones too.** Folding a store only one window
used into a tag in its header was tried and dropped: it made private state a
second kind of thing, hid exactly the state you would want to wire up, and
squeezed the window's name. Now every store of a program that keeps state is on
the left, used or not, so an orphaned store is one drag from a window. A
program that keeps none (the dial) still has a registry entry, so stores are
filtered by `HOLDING`, not by being registered.

**Wires start only at the jacks** (the docks on a node's edge); a press
anywhere else on a node **focuses** it instead. A focused window keeps lit its
own store, what it follows and those wires; a focused store keeps lit every
window bound to it or following it; everything else fades. `relatedTo` decides
what is related, purely from the layout. Focus is the bay's own view state, a
stream of presses, not app state: it is not saved and two bays focus apart. It
is combined with the drawn layout in one `combineLatest`, so a redraw keeps the
focus; a focus on something that is gone simply fades nothing. Clicking the
empty board clears it. It reads presses, not clicks, because a drag captures
the pointer on the board, and the click that ends it would land on the board
and clear the focus.

Drag from a jack between a store and a window's header to bind the window to it (same
program only, and not the store it already has), or between a store and a port
to follow it; only ends that would make a valid action stay lit, judged by the
same `commandOf` that turns the drop into a command. Drag a bound optional
port's jack into empty space, or click its ×, to unplug it; a clock input and a
window's own state cannot be unplugged, only moved. Each window's header has a
**locate** button that flies the camera to it (below). One shared `drags$` feeds both the rubber-band wire and the
command, for the todo grip's reason, and `graph$` dedupes with `sameGraph`,
which names every field, because the workspace emits on every pointer move.

**Below the graph's stores are the app's globals** (workspace, appearance,
formulas, themes, library), dashed and without a jack, since nothing binds to
them; and a main store that holds data with no window open is listed too
(`held$`, the folds' keys as one sorted string, so a ticking timer does not
churn it), so it can be inspected, bound or pruned.

**Focusing inspects.** Under the graph, every state the focus keeps lit is
shown as a JSON tree (`focusedStores`, in the left column's order), so a window
shows its own state and everything it follows, and a store shows itself. The
program reads them through `AppState.inspect$(target)`, which exists for this
program alone and is read-only, so nothing can be edited around the reducers;
target ids are `store:<program>:<store>` and `global:<name>` (`inventory.ts`).
It stays cheap for the inspector's three reasons:

- **Only the focused states are followed**, never all of them, and an unchanged
  value is skipped by reference, which is exact because a fold makes a new
  object only when something changed.
- **A busy state is read at most four times a second** (`throttleTime`, leading
  and trailing): playback changes the transport every frame, and the rows were
  measured touching the DOM 8 times in 2 s of it.
- **Only expanded branches are walked** (`rowsOf`), and rows and sections are
  kept in place by path and target, so values update without a rebuild and an
  open branch stays open.

`displayable` turns the folds' `Map`s into objects first: `JSON.stringify`
writes a `Map` as `{}`. Which branches are open is view state, keyed by target
and path together so two states never share one; it is not saved, like the
focus. The component's `focus$` is replayed, because the map fades by it and the
program inspects by it, and both must see the same one.

**Prune** (in the bar above) deletes every store no wire touches, data and all,
and says how many first; one click arms it, a second within three seconds
prunes. It is one `prune` input routed twice: the workspace drops the unbound
registry entries (`prune-stores`, undoable), and every fold receives a `keep`
store event with the bound stores and window ids, read from the same workspace,
so it cannot matter which listener runs first. It is one documents step, so undo
brings the data back too.

## Switching a window's program

A window's title is a button: clicking it opens a picker of every program by
category, then the chosen program's stores (its Main always offered for a
document program, registered yet or not) and **+** for a new one. Picking
replaces the window's process in place (`replace`): same slot in the list, so the
same depth, same frame grown to the new program's minimum, links carried over,
and a new process id, because a running process is a subscription and the new
program needs a fresh one; the old one closes like a quit. It is one undoable
step. A program that keeps no state is replaced at once, with no second step.

The window still knows nothing about programs. It gets `SwitchGroup`s as plain
data and emits `replace` with what the clicked row carried: the program id, the
store and the minimum size are read off the row's data attributes, and
`liveProcess$` and the reducer narrow them. Two traps in the title: the click
that opens the picker arrives on the **title**, not the name, because the drag
captures the pointer there; and a drag that ends over the name would also click
it, so the picker opens only when press and click are within `CLICK_SLOP`
pixels.

## Following: programs declare their inputs

A window binds its own state and may read one **input** beside it, from another
program's store. **Each program declares its inputs** (`Program.inputs`, built
from the definitions in `src/inputs.ts`): the sketch takes `playbackInput`, the
timeline `ownPlaybackInput` (its clock is its own store, so it follows nothing),
the dial `progressInput`, which accepts a `playback` clock only, and the
progress bar `sourceInput`, which accepts a `focus` timer or an `agenda`. An input
definition is inert data: its title, the kinds it accepts, where a new window
starts (`initial`), and per readable kind how a store of it is read (`read`). `from: 'followed'` bindings belong
to a process; `from: 'store'` bindings belong to the document it is showing.
There is no separate table to keep
in step: adding an input is one field on the program.

**A window can only hold the inputs its own program declares, and the type
says so.** The program table is a record keyed by id (`src/programs.ts`,
`satisfies { [K in ProgramId]: Program<K> }`), and `Process` is derived from it
with `import type`: one member per program, whose `follows` is a record keyed by
input name (`BindingsOf`). A sketch's is `{ playback: PlaybackBinding }`, its
knobs being its store's, an output's `{ playback, in?: SketchBinding | PedalBinding }`,
the dial's `{ progress: PlaybackBinding }`,
a ticket list's and a timeline's have no keys at all, so a focus binding on a sketch
does not type-check. An input whose `initial` is `null` is **optional**: a new
window starts without it, its key is optional in the type, `fits` does not
require it, and the popover offers **None** above its stores, which emits
`unfollow`. A required input (the clock) cannot be let go: the reducer refuses
it. `BindingsOf` reads the kinds
with `infer` from the input's `sources`: indexing `D['sources']` inside the
conditional falls back to the constraint and lets every kind through.

- **Where the program is only known at runtime it is narrowed, never cast.**
  Launch, replace, follow, the default layout and the parser build a `Draft`
  (follows as a plain `Bindings` record) and keep it only if `ownsInputs`
  passes: `fits` checks that every binding names an input that accepts its kind
  and every followed input is bound. A draft that does not fit leaves the
  workspace unchanged, or is dropped on load.
- Input names from storage are looked up with `definitionOf`/`followedBy`,
  never `inputs[name]`: every object has a `constructor`.

- **A refused action is no step.** `step` hands back the very workspace it was
  given when it refuses, `reduceWorkspace` passes that through untouched, and
  `reduceHistory` records nothing for it, so clicking None on a knob already at
  None leaves no empty undo. A `raise` is the exception: it must still end the
  last drag's step even when it changes nothing.
- **The workspace asks, it does not import.** `reduceWorkspace`,
  `reduceHistory`, `parseWorkspace`, `defaultWorkspace` and `restoreState` take
  an `inputsFor(program)`; `programs.ts` builds it from the program table, and tests
  use `src/inputs.fixture.ts`, because the program modules pull in the DOM. The
  declarations are plain data, so building the table never evaluates the
  reactive cycle early.
- **A follow is a tagged binding**, `{ kind, store }`, one per followed input,
  and the `follow` gesture names the input it binds. Every follower starts with
  an explicit binding to the main clock, so counting
  windows on a store never has to guess at an implicit one. The reducer and the
  parser accept a binding only if the program's input accepts its kind and the
  store belongs to that kind's program (`accepts`, `sourceProgram`). A saved
  follow from before kinds, `{ program: 'timeline', store }`, is read as a
  playback binding to the same store, and a saved array of follows goes to the
  first input that accepts each kind; a forged one falls back to the input's
  `initial`.
- `scoped` gives each window `reading$`: what its `source` input's store is
  doing, as a `Reading` (`readingOf`), switched on a rebind. The dial needs none
  of it: it reads `playhead$` like a sketch and always scrubs.
- `liveProcess$` stamps each input with the window's playback target, or null
  when it has none (`playbackBinding`: a timeline's own store, a scrubbable
  binding otherwise). `routePlayback$` feeds those to the clocks fold; its pure
  routing fold tracks holds by process and releases an old clock on rebind or
  close, leaving it held while another process still scrubs it. The release must
  name the **old** target: stamping it with the new binding would strand the old
  hold.
- The popover has one section per kind each followed input accepts. The source is named
  only where there is a choice ("Source · Focus" and "Source · Agenda"; the
  sketch's section is just "Playback"). A followed store is in use for pruning, deletion
  and counts. Forking copies the canonical document once, clocks and focus
  timers starting paused; a connection is never saved or forked.

## The command palette

⌘K (Ctrl+K) opens `hks-palette` from anywhere, in the chrome slot. It is a
component like any other: `opens$`, `closes$` and `picks$` out, `connect$(commands$,
open$)` in, and it knows commands only as `{ id, label, hint }`. What exists is
derived in `src/commands.ts`: `commandsOf(programs, sections)` lists launches,
section jumps, slide steps, undo/redo, fit, reset, the minimap, looks and the
workspace actions, and `pickedOf` parses a picked id back into a `Picked`
union, which `main.ts` routes into the same streams the toolbar, navigator and
appearance editors already feed. The palette therefore adds no behaviour of its
own — every command is something another control could already do — and a new
command is one entry in `commandsOf` plus one case where it is routed. Filtering
is every typed word appearing in the label or hint, as a `combineLatest` of the
commands and the query, not a remembered list.

**Quick capture: a command can take the rest of the query.** A `Command` may
name a `keyword`, and `matched` hands everything after it to that command, so
`todo call Ada` is the one row "Add to-do: call Ada" and the pick carries its
text. Picking a keyword command with nothing after it fills in the keyword
instead of running, and both read the row from one shared `chosen$`, for the
todo submit's reason. The palette still knows nothing of what a capture does:
`CAPTURES` in `commands.ts` lists them (`ticket`, `todo`, `note`), `pickedOf`
parses the text, and `capturedActions` in `src/capture.ts` turns one into
document actions: a ticket or a note. They are
read against the documents fold, like placing a blueprint.

**A capture is offered once per state, not into Main alone.** `commandsOf`
makes one command per state of the program (`withMain`, so Main is there before
any window opened it), all claiming the same keyword, and `matched` hands the
text to every one of them: `todo oat milk` lists "Add to-do to Groceries",
"Add to-do to Main" and so on, and ↑/↓ chooses. `captureStores` orders them:
the frontmost window's state of that program first, since that is the list in
front of you, then Main, then by name. Rows were chosen over a syntax such as
`todo @groceries`, which needs names remembered and a misspelling handled. The
state travels in the command id, which a clicked row carries, so
`capturedActions` refuses a state of another program or one since deleted. A capture is one undo step, which
is why a note's `create` carries its text rather than being followed by an
`edit`: different keys, so two steps.

## Animation and export

A sketch's controls have three tabs, **Parameters**, **Scene** and **Animation**,
and the tab is a setting like any other (`SketchSettings.tab`), saved with the
window. Each tab holds only what is its own:

- **Parameters** is the formula's own numbers and nothing else: one row per knob
  the compiled formula reads, under the name its `#define K1 feed_rate` gives it
  (`knobLabelsOf`, read like `STEPS` and `WRAPS`; the macro is never expanded,
  since nothing in GLSL is spelt `K1`), with its motion beside it, and an empty
  state when the formula reads none.
- **Scene** is configuration, in four groups by what they change: **Sampling**
  (lattice, density, focus: where the formula is evaluated), **Space** (how its
  output is read), **Drawing** (mode, dot size, depth, trails, axes) and
  **Camera** (lens, fit, the view). Rows share one grid of label, control and
  value, so controls line up down a group, and the groups flow into two columns
  where the window has room.
- **Animation** is the strip and the export.

**Every control belongs to exactly one group, and a group resets as a whole.**
`GROUPS` is the closed list, `resetGroup(panel, group)` the pure reset, and a
reset arrives as an ordinary `ControlChange` (`{ field: 'reset', group }`), so
the fold applies it like any other edit. Resetting the camera also resets the
orbit, in `withControl`, since the view is part of the camera. Each reset is
disabled while it would change nothing: `groupChanged` compares the reset
panel with `samePanel`, and `controlsView` hands the five answers to the view.
A new control is a field in one group's reset, or it never resets.

The **Formula and theme sit above both**, in the header row
beside the tab switch, because they decide what the sketch shows and so what the
animation exports; inside Parameters they read as drawing settings. The
Animation tab is two components the program slots into the controls'
`animation` slot: `hks-frame-strip`, a Photoshop-style frame strip, and
`hks-export-panel`, the export settings with **Export** and **Save frame**. The
controls know neither; `sketch.program.ts` composes them.

**One cell is one exported frame.** The strip's frame count is
`frameCount(duration, export fps)`, so changing the export's frame rate changes
the strip. Zoom is a continuous **level**, `SketchSettings.stripLevel`: log2 of
frames per tile at the base tile width, so 0 is one frame per tile. A tile stands
for `2^ceil(level)` frames, and between whole levels it **widens** rather than
splitting, so a pinch is smooth and every tile still holds a whole picture,
rendered at the tile's own shape rather than stretched. − and + step a whole
level, **fit** picks the level that shows the whole loop. All of it is pure maths
in `animation.ts` (`stripGeometry`, `zoomedStrip`, `tilesIn`, `frameAtX`,
`followed`). Clicking or dragging the strip emits an ordinary `scrub`, so the
shared playhead and every other sketch follow, and while playing the strip pages
along with the playhead (only while playing: a paused strip belongs to whoever
scrolls it).

**A pinch zooms the strip, not the workspace.** A trackpad pinch arrives as
ctrl+wheel, which the canvas also reads as its own zoom. The strip claims it with
`preventDefault`, and the canvas skips any wheel that is already
`defaultPrevented` — the same contract as a todo grip's arrow keys. A pinch is
anchored: `zoomedStrip` returns the new level **and** the scroll that keeps the
frame under the fingers in place. That scroll is applied `observeOn(asapScheduler)`,
after the synchronous settings fold has laid out the new level; applied at once,
the track still has its old width and the browser clamps the scroll.

The strip takes one `layout$` — geometry and the visible tile range together —
not a geometry stream beside a range derived from it, which would be two paths
into one `combineLatest` and fire twice on every pinch tick. The playhead's x is
computed from that same layout inside the strip (`markerX`). Tiles are rebuilt
only when what a tile stands for changes (frames, frames per tile); a pinch
between whole levels only moves and widens the ones in view, so their pictures
stay up until the new ones arrive.

The strip is virtualised: only the tiles in view, plus one either side, exist in
the DOM or get rendered. **They are rendered as one picture**, a `Filmstrip`:
every visible tile side by side in a single offscreen render (a viewport and a
scissor per tile, so each draw's clear stays in its own slot), handed over as one
`ImageBitmap` and shown on one `.film` canvas behind the tiles, which carry only
the numbers and the current-frame ring. A canvas per tile looked equivalent and
was not: fifteen bitmap handoffs a frame cost almost no CPU (1,066 of them took
5 ms) but each is a separate canvas for the compositor, and an orbit drag with
the strip open dropped to 30 fps even at lattice 32. One handoff a frame drops
none, even at lattice 128 in surface mode. Thinning the thumbnail lattice was
tried as well and changed nothing, so it is not there. Thumbnails re-render at
most once per animation frame (`auditTime(0, animationFrameScheduler)`), so they
move with the canvas rather than stepping behind it.

**A strip never draws on the engine's canvas.** Every bitmap a window takes
from that canvas copies the whole of it, however small the crop, so a strip
that grew it to 5632 x 512 made all eight windows of Light show copy 2.9
megapixels each per frame to show 0.4 between them, and playback fell to 47 fps
with the script idle at 1.2 ms. The tiles go into a **film** of their own
(`filmFor`, one target per engine), and `filmed` averages it down into the
canvas at the strip's final size with a box filter (`downsample.frag`), so the
canvas stays as small as the largest window.

The film is **never resized down**. The number of visible tiles and their width
change on every pinch tick and every time playback pages the strip, and
reallocating something that size (up to the GPU's limit at 8x supersampling)
took up to 100 ms — a pinch ran at 32 fps. `filmFor` only grows it, by half at
least and capped at the viewport and texture limits, and a strip reserves its
**whole width before its first tile**: growing clears it, and growing tile by
tile left only the last one, a black strip that went unnoticed for the Output's.
The canvas grows exactly (`grown`), because an export writes the whole canvas
out. A slot is a whole number of the tile's pixels times the supersampling, so
the average covers each block exactly.
Its host has `contain: inline-size`, which is load-bearing: without it the
thousands-of-pixels track sets the controls' intrinsic width, and the strip
pushes past the window instead of scrolling inside it.

**A sketch's strip and export are an Output's.** Both draw the sketch's own
recipe through the engine (`filmstrip$`, `imageExport$`), the strip in the
shared engine while the Animation tab is open and an export in an engine of its
own while it runs. That is what decouples export from the screen: resolution is
the export's own (480 to 2160 px on the long side, aspect from the sketch,
rounded even because VP8 and VP9 reject odd sizes), the canvas zoom no longer
matters, the sketch keeps playing while you export, and no capture clock
overrides the playhead.

**A sketch is framed by its window, a pedal by the reference side.** A moment's
`frame` is the sketch-unit size the picture stands for: the window's for the
live view, its strip and its export (`framed: true`), so an export at 2160 px
scales the dots up with the picture; `null` for a pedal or an Output, which
frame every sketch in a chain at `REFERENCE_SIDE`.

**A thumbnail is the frame scaled down, never reframed.** It renders with the
sketch's own parameters, size included, fitted into its tile and centred
(`fitted`), with the backdrop around it, so a tile widened between zoom levels or
a sketch too wide for the clamped tile width shows the same crop the sketch
does. Two earlier shortcuts made thumbnails disagree with the sketch, and both
are traps:

- **Do not floor the dot size.** Scaled exactly, a 54-pixel tile turns 5-pixel
  dots into specks, and a floor of half their on-screen size looked like the fix,
  but it made every dense lattice a solid blob the sketch never shows.
- **Do not raster at tile size.** A dot under a couple of pixels loses most of
  its coverage and the miniature reads pale. Tiles render supersampled —
  `supersampleFor`, up to 8x, lowered to fit `MAX_VIEWPORT_DIMS` because a wide
  strip at 8x would not fit one target — and `filmed` averages them down, a true
  area average; CSS scaling of a canvas is bilinear and skips most of the
  pixels. 4x still read pale on dense spikes; 8x matched a
  high-quality downscale of the sketch itself.

The fragment shader's two size rules — the anti-aliasing band and `SMALL_DOT`,
below which a dot keeps its soft edge — are in the **live sketch's** pixels:
`uDotScale`, the moment's `dotScale`, is target pixels per on-screen pixel, 1
for the sketch and `(picture px / sketch CSS px) / devicePixelRatio` for a
thumbnail. Measured in the
thumbnail's own pixels, the same dot would be "small" there and crisp in the
sketch, and dense areas came out half as dark. Exports keep 1: they are their
own picture, not a view of the screen. Thumbnails draw with trails off
(`stillOf` on the recipe), since each tile stands alone; an export with trails plays the loop once unrecorded
first, so the first kept frame carries the trail of the last.

**The encoder paces the export; there is no timer.** `imageExport$` `concatMap`s over
the frame list: it draws a frame, then hands the canvas to the writer and waits
for it before the next. For WebM the writer is WebCodecs' `VideoEncoder`, given
each frame's exact timestamp and a key frame every two seconds, and `drained`
waits on its `dequeue` event while more than two frames are queued, so a long
export never holds every frame in memory. For PNG frames it is
`convertToBlob`. A throttled tab therefore only exports slower, never wrong.
`exhaustMap` ignores a second Export while one runs, and Export is disabled in
place rather than swapped for Cancel, or a double-click would start and stop
one. The engine and writer stay open until unsubscribed, which is why `imageExport$`
ends at the file with `takeWhile(…, true)`.

**The zip never stalls at the end.** Its CRC-32 is a plain table loop (a
callback per byte through `reduce` took most of a second over a 240-frame
export), computed by `zipEntry` as each PNG arrives rather than all at once in
`finish`, and `zip` returns the parts for a `Blob` instead of joining 80 MB into
one array first. The PNG export used to end in a 0.6–1.2 s freeze; it now has no
frame over 50 ms. What remains is `convertToBlob`'s read-back of each frame from
the GPU, which costs a frame now and then while exporting and is the first thing
a worker would take, if it ever matters.

**No libraries: the containers are ours.** The user asked for export without
external dependencies, so `export/webm.ts` writes the WebM (EBML header, Info,
Tracks, Cues, one Cluster per key frame of SimpleBlocks) and `export/zip.ts`
writes a stored zip with its own CRC-32. Both are pure functions, bytes in and
bytes out. Two traps: Cues sit **before** the clusters with fixed 8-byte
positions, so their own size cannot shift the offsets they hold; and a block's
timecode is a signed 16-bit offset from its cluster, which is why a cluster
starts at every key frame. MP4 is not offered: its muxer is too large to
hand-write sensibly. Mediabunny did this briefly and was removed for that reason.

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
  derives what it displays: `AppState` carries app state only — the playhead,
  transport and the two formula selectors — and never a stream shaped for one
  window. Before adding a field, check whether one program could derive it
  instead; `panel$` and a global `source$` both used to live there and both were
  really one window's business.
- **`AppState` vs a state type.** `Workspace`, `SketchParams` and the like are
  values; `AppState` is the record of _streams_ that carry them, which is why
  every member keeps its `$` and why it is not called `State`. It lives in
  `program.ts` beside `Program` and `ProgramId`: splitting it out again brings
  back a type-only import cycle, since `Program.connect$` takes an `AppState` and
  `AppState.frame$` takes a `ProgramId`.
- **`src/main.ts`** — the graph and nothing else: it calls the `*.graph.ts`
  modules in dependency order, closes the cycle, and subscribes once. It reads
  as the app's dataflow diagram, and it should stay about a screen long.
- **`src/graph/*.graph.ts`** — the sub-graphs `main.ts` composes, each a
  function from the streams it reads to a record of the streams it makes:
  `chrome` (mounting the fixed chrome, and `connectChrome$`, its one edge),
  `intents` (what the chrome's controls ask for), `history` and `projections`
  (the documents fold and its per-document streams), `timekeeping` (playback
  clocks, focus timers and plans), `selection` (selection, clipboard,
  placement), `navigation` (jumps and camera flights), `state-mode`, `app-state`
  (`scopedOf`, the `AppState` each window gets), `windows` (one `liveProcess$`
  per process), the two action streams, and `persistence`. A module's parameter
  type is a `Pick` of the records it reads (`Pick<Projections, 'workspace$'>`),
  so its imports say what it depends on and `main.ts` can pass whole records by
  spreading them. Its return type is inferred, and `X = ReturnType<typeof xOf>`
  names it. No `tap` and no GL in any of them; the DOM appears only in
  `mountChrome`. When this file says something is "folded in `main.ts`", it
  means one of these modules.

`src/lib/` sits underneath everything: `dom`, `math`, `rx`, `color`, `storage`.

The program layer sits at the `src/` root, above the components it composes:
`program.ts` (identity and contracts), `workspace.ts` (processes, camera and
toolbar, and their reducer), `settings.ts` (what each window remembers),
`state-store.ts` (the one snapshot), `process.ts` (`liveProcess$`),
`appearance.ts`, `appearances.ts`, `image.ts` and `pedals.ts` (the cable
recipe and the pedal table), `engine/` (the one GL effect that cooks recipes),
`main.ts` and the `graph/` it composes.

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

### The feedback cycle, and how it is closed

Sliders emit → the playhead consumes → the sliders display the playhead. This
was long the open problem here, and it is closed by the rule every control now
follows: **a component emits what the user did, a fold owns the value, and
`connect$` writes it back.** Nothing keeps a copy of the value outside the fold,
so there is no second owner to fall out of step, and the loop runs through the
app's one cycle (signals out, state in) rather than a local one. A slider must
never reach for the current value itself.

**Ownership during a gesture belongs in the fold too.** A slider used to emit
only positions, on pointer moves, so a thumb held still during playback lost the
playhead to the clock and it ran on from under the pointer. A control now
reports the gesture, not just a value: `pointerGesture$` in `shared/drag.ts`
yields `grab`, `move` and `release`, the latter from the end event the gesture
already watched for, and a `Scrub` carries its phase all the way to
`reduceTransport`. Whoever holds the playhead is state, so it is a field of the
fold (`held`), not a flag in a component. The general lesson: if a value can be
held, the hold is part of the value's state.

## Type safety

**No type assertions in `src/`.** No `as`, no `!`, no `any`, and no explicit type
argument that the compiler cannot check — `fromEvent<PointerEvent>(el, 'x')` is a
cast wearing a costume. The count is currently zero; keep it there.

**`as const` is the exception, and it is encouraged.** It is not a cast: it asks
the compiler for the narrowest type of a literal rather than overriding what it
inferred, so nothing unchecked gets through. Use it for every closed list, and
derive the union from the list rather than writing both:

```ts
export const EDGES = ['top', 'bottom', 'left', 'right'] as const;
export type Edge = (typeof EDGES)[number];
```

`PROGRAM_IDS`, `TOKENS`, `DRAW_MODES`, `EDGES`, `ZOOM_COMMANDS` and
`RESIZE_EDGES` all have this shape, so a value is added in one place and the
type, the guard (`isEdge` and friends) and every exhaustive `switch` follow.

When a value needs narrowing, narrow it at runtime (`instanceof`) rather than
asserting it. When an external source needs adapting, reach for
`new Observable<T>(subscriber => ...)`: the callback body type-checks against `T`,
so the emitted type is verified rather than declared. The adapters in `lib/rx.ts`
— `fromElementEvent$`, `fromDocumentEvent$`, `observeResize$` — all work this way.

**Shape over declaration.** Let a type be read off the value rather than
declared beside it: as few return types and annotations as possible, and
`satisfies T` where a value should be checked against a type. An annotation
replaces what was inferred with something wider, and whatever depended on the
narrow type loses it silently. Every program is `… satisfies Program`, never
`const x: Program = …`: `Process` is derived from the program record, and an
annotated program's inputs widen to `ProgramInputs`, so its `follows` types as
`{}` and nothing errors where the annotation was added. Declare a type where
there is no value to infer from — parameters, unions, what untrusted input is
narrowed into — or where widening is the point, as `inputsFor` is: the
workspace looks programs up at runtime.

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
must be compared, write a named comparator next to it that names every field, as
`samePanel`, `sameOrbit`, `sameWiring` and `sameGraph` do.

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
  or one `scan` over a union of actions, instead. Four of these have been found
  and removed: `params$` -> `geometry$`, `controls.sketch$` -> `size$`, and
  `formula` sitting in `SketchParams` while also selecting the shader — which put
  `controls.sketch$` on both inputs of the sketch's `combineLatest`. The last one
  is why `SketchParams` carries no `formula`: the program is already compiled by
  the time those values are applied, so naming it there was both dead and a
  double-draw. `controls.formula$` is a separate output for the same reason.
  The fourth was the voice and drums reading `playhead$` and `playing$` side by
  side: Stop moves both in one fold step, the combine saw "at 0, still playing"
  first, and the scheduler struck the loop's first notes on Stop. A window now
  gets its whole clock as `clock$`, and a program that needs more than one of
  its fields reads that.
- **Side effects on an event go in a `tap`, after the operator that decides.**
  A control that claims an event (`preventDefault`, a blur) decides in a
  `map`/`mergeMap` that returns the event beside its value, claims it in a
  `tap`, and maps the value out; deciding and claiming in one callback hid an
  effect in what reads as a pure step. A scheduler's fold likewise gets the
  audio time stamped onto its input by a `map` before the `scan`, never read
  inside the reducer.
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

    Four hundred and seventy-four of them survive in `src/` today, every one a single line. Treat that
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

**Looping is on by default, and turning it off closes a cycle on purpose.** The
loop button emits **`loop`**, a third `TransportCommand` that the fold flips just
like `toggle`. With looping off, reaching the end must pause, and pausing is a
fact about position. So play state and position can no longer be two folds where
one never reads the other. They are one `Transport = { at, playing, looping }`,
folded by `reduceTransport` over three kinds of action:

- `command` — `toggle`, `stop`, `loop`. Playing again from the end restarts at 0.
- `scrub` — a gesture from a timeline, the playhead dial or a frame strip. A
  `grab` or `move` seeks and sets `held`; a `release` only clears it, since where
  the pointer was let go is not a new position.
- `advance` — `ms` since the previous frame. It wraps while looping and clamps
  to 1 and pauses otherwise.

The frames are gated by that same fold, so `createClocks$` reads itself through a
`defer`, the same ordering trick as the workspace cycle: one `animationFrames()`
loop runs while **any** clock is `playing && !held`, and each frame advances every
such clock by its own duration. Pausing
at the end therefore also stops the `rAF` loop, and so does a hold: held is not
paused, so `playing` stays true and playback resumes from wherever the pointer
let go, wherever that pointer was (any of the controls above, since they all
feed the one fold). `playhead$`, `playing$`, `looping$` and `duration$` in a
window's `AppState` are projections of the clock that window runs on. The fold
is `refCount: false`, so closing the last timeline does not rewind any clock.

Deltas rather than `elapsed` are load-bearing: `animationFrames()` restarts its
clock on every subscription, so resuming with `elapsed` would jump the playhead
back to the offset it started from. That is what `pairwise()` is doing there.

`duration: 0` no longer means paused — the button does that now — so
`defaultDuration` seeds at 8 seconds and `parseDuration` rejects anything not above 0. The reducer still guards against 0,
which now means only "a loop of no length cannot advance".

## The day as a clock

**A clock can run on the time of day.** The timeline's sun turns its clock
into a **day clock** (`Clock.day`): its loop is today, `at` is how far through
the local day the wall clock stands (`dayFractionOf`), and `secondsOf` reads
its loop as 86,400 seconds. It cannot be played, stopped or scrubbed (the fold
refuses those commands, so the dial and a frame strip simply cannot move it),
and its ticks stay its own, so 24 ticks are hours and a
24-step pattern gate is a schedule. It keeps its loop length for when the sun
is turned off again.

- **The wall reaches the fold as an action**, `wall` with the day's fraction,
  from a stream `createClocks$` takes as a parameter: `lib/rx.ts` touches
  `window`, and the fold is shared code the tests load in Node. It runs only
  while some clock is a day clock, once a second, and moves only those clocks,
  so every other clock keeps its reference.
- **It is saved where it stood still** (`restedClocks`), like a playing clock,
  or storage would be rewritten every second; on load the next wall action puts
  it back on today.
- The timeline reads `14:32 / 24 h` (`timeOfDayLabel`) and greys its keys; the
  window's own playhead, pace and everything built on them follow unchanged,
  so a dial, a plot, a gate or a signal shows the day with no code of its own.

**A source can be read on a clock of its own.** A follower reads a source at
its **own** playhead, which is what keeps a wave identical on two clocks and an
export exact. That makes a day clock useless to a sketch looping every eight
seconds: following a schedule on its own playhead reads the schedule's 8 s
compression, and put on the day clock itself the sketch would move one
86,400th of its loop a second. So signals and gates have a store input
`time` (**read on**, `timeInput`), accepting a playback store:

- **It lives in the source's own `sources`**, beside phase, offset and depth or
  a gate's bits, so saving, forking, pruning (`reachedFrom` keeps the clock),
  undo and blueprints carry it with no code of their own. The circuit reads
  only `GATES[kind].bits`, and `waveOf` only `PARAMS`, so neither mistakes it
  for an input.
- **`driverIn` decides it in one place.** A followed store with a `time` link is
  resolved by `nowOn`: the driver is built at **that** clock's pace (a gate's
  table at its ticks, a voice curve at its length) and sampled at its moment
  into a one-sample `Curve`, one value over the follower's whole loop. It is a
  pure function of that clock's moment; a thumbnail or an export takes it as it
  stands when it is made, as it takes the pointer.
- **The driver and the moment are chained, not combined**: the clock moves
  both, and a `combineLatest` would fire twice on a change of pace.
- Only the followed store's own `time` counts. A signal chained into it is
  evaluated at the same moment as its parent, whatever clock it names.

**A source is shown on the clock it is read on.** `scoped` takes the window's
playback binding and its store's `time` link together and prefers the link, so
a signal read on the day marks the time of day and a gate steps on it, whatever
its own playback input says; letting go of the link hands the window back to
that input. Every reader of the window's clock (playhead, pace, ticks) follows
from that one choice.

**The state menu says when a playback is set aside.** `inputGroups` names the
read-on clock in `FollowGroup.setAside` on a window's playback rows only, and
the window strikes the binding through and adds "read on Store 1", so the menu
never claims a clock the window is not showing.

## Themes

A **theme** is a document exactly like a formula: named, kept in a registry,
edited by its own program, and read by sketches through
`AppState.theme$(name)`. A sketch picks one by name in its own panel, so two
sketches can wear different themes while a third shares one — and editing a theme
repaints every sketch showing it. Colours used to be three fields on
`SketchParams`; they were per-window settings pretending to be render parameters.

A theme is `1..n` stops (`at` in [0, 1], plus a colour) and a `blend`:

- **`smooth`** interpolates between neighbouring stops.
- **`steps`** does not: each stop's colour holds until the next one. A stop
  sitting exactly at `1` therefore owns nothing, which is why the built-in
  `bands` places its three stops at 0, 0.34 and 0.67.

**Both blends are the same texture, filled differently.** `buildRamp` turns a
theme into a 256-entry RGBA lookup and the fragment shader samples it by depth,
so the shader never learns what a stop is and `n` stops cost exactly what three
did. The texture is `NEAREST`-filtered, or the sampler would smear a stepped
theme across texels and quietly re-introduce the interpolation the mode exists to
avoid. It belongs to the `Surface`, one per canvas — not to the compiled `Sketch`,
which is thrown away on every recompile.

`gradientCss` builds the editor's preview bar from the same stops, including the
doubled positions that make `steps` hard in CSS. Preview and render are two
readings of one theme; if you change one rule, change both or they will drift.

The editor never edits its own DOM. Add and remove compute a whole new theme from
the current one and emit it; the rows come back through `connect$`. That keeps the
component a pure source, and it is why `rows$` rebuilds on a **shape** change
(stop count or blend) but not on a value the user is currently dragging.

## Appearance

The app has a theme of its own, and it is a document exactly like a sketch theme:
named presets in `appearances.ts` (`paper`, the default, `studio`, `night`),
edited by the `appearance` program, folded in `main.ts` into a `Map` keyed by
name. The difference is that the app wears **one at a time**: `look$` is the
active name, global, picked by `look` inputs from any appearance editor, so two
editors follow each other.

An `Appearance` is a record of `Token` → `#rrggbb`. Opaque hex only, so every token
fits an `<input type="color">`; where translucency is wanted (`--shadow`) the CSS
mixes it with `color-mix`. `appearanceFrom` names every token, so adding one to
`Token` is a compile error until it is built, and `parseAppearance` falls back per
token rather than rejecting the whole record — a token added later must not wipe a
user's stored edits.

**No component knows what an appearance is.** The model lives at the program
layer; the editor receives its token names through `tokens()` and its presets
through `presets()`, and the canvas receives a plain `ReadonlyMap` of custom
properties and sets them on its host, where every window, the toolbar and every
shadow root below inherit them. That is why the registry is the only definition
of a colour: there is no palette in `styles.css` to drift from it. The formula
editor's syntax colours are tokens too (`--code-*`).

The look and its edits persist with everything else in `hakase.state`. Both
folds are `refCount: false` for the same reason the formula edits are.

## The formula editor

The editor is a small IDE, not a console: a one-paragraph summary of the chosen
formula, a collapsed "How formulas work" reference, the highlighted textarea, the
compiler's message, and a footer with the compile status on the left and the
preset picker on the right.

**The documentation is data the program hands in**, like the presets: each
`Formula` carries a `summary`, and `FORMULA_GUIDE` in `formula.ts` explains the
contract (`x`, `y`, `t`, the returned `.xy` and `.z`). The editor renders them
with `guide()` and the `about$` input and still knows nothing about GLSL. The
guide describes what `sketch.vert` passes in and reads back, so a change to that
contract is a change to the guide. Its sources are
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

Compilation happens in the engine, which keeps one program per store and
replaces it only when a new text links: a failure leaves the last program that
linked, so the picture never blanks. Preserve that property. What a window
needs to know about its formula, the compiler's message and which knobs it
reads, comes from `checked$`, a cached check in the same engine
(`checkFormula`), and failure is a value there, not an exception.

The textarea is highlighted by painting a Prism-tokenised `<pre>` behind it and
making the textarea's own text transparent. That keeps a real `<textarea>`, so
the caret, native undo, IME and accessibility all still work, and `changes$`
stays a plain `input` event. The price is that **both layers must lay text out
identically** — font, line-height, padding, border, wrap — or the caret drifts
away from the glyphs. Change a text metric on one and you must change the other.
Highlighting is driven by the raw `input` stream so it repaints per keystroke,
while compilation is debounced; do not merge those two.

## The formula library

A formula is either a built-in (`FormulaName`, the registry's keys) or one the
user saved (`CustomId`, `custom-<n>`); everything that names a formula takes a
`FormulaId`, the union, so a custom id is checked like a built-in one rather
than widened to `string`. `Library` (in `src/library.ts`, folded in `main.ts`,
saved in the snapshot) holds each saved formula's label and source;
`source$(id)` falls back to it the way it falls back to the registry, and edits
apply to either. Ids come from a monotone counter, like `launched`.

The formula editor's ⋯ menu saves the current text as a new formula, copies a
share link, or deletes a saved one (built-ins cannot be). Saving emits two
inputs in order — the `add`, then this editor's selection of it — and the id is
chosen by the program from the library's counter, so the editor can select a
formula that did not exist a moment ago. Both pickers, the editor's and every
sketch's, take their options as a stream now, rebuilt together with the
selected value: rebuilt after it, the selection would be lost.

A share link is the app's URL with `#formula=` and the label and source as
base64url JSON. `sharedFormulas$` in `src/share.ts` reads it on load and on
every `hashchange`, clears it so a reload does not import it again, and the
library imports it, skipping an exact copy of one it already holds. The hash is
untrusted input and only ever parsed, never run — a shared formula is compiled
like any other, and a broken one simply shows its error.

**Guide strings are single-quoted** in `formula.ts`, so an apostrophe ends them:
write "the value of its slider", not "its slider's value". This has broken the
build twice.

## Adding a formula

The `Formula` contract lives in `components/sketch/formulas/formula.ts`, one level
above the implementations, so a formula can annotate itself without importing the
registry that imports it. `components/sketch/formulas/registry.ts` is the single
source of truth for selectable sketch
functions: one entry carries the key, the label, a `summary` the editor shows
beside it, and the function. `FormulaName`
is `keyof typeof formulas`, so an entry automatically becomes an option in the
editor's picker and a shader the view can build. Do not add a
parallel list of names or labels anywhere — that is the thing this shape exists
to prevent.

## Storybook

**Storybook is part of the UI contract, not optional documentation.** Every UI
change must keep the catalogue accurate in the same change. Before implementing
a control, check the shared UI library and its stories; reuse the existing
primitive or extend it with a reusable variant. Application components and
stories must consume the same implementation. Do not create a separate copy of
a control for a program or a prettier imitation for its story.

For new or changed UI:

- **New component or shared primitive:** add a catalogue entry with a working
  preview, searchable element/helper names and a useful usage example. Give
  reusable controls a direct story; appearing incidentally inside a larger
  program is not enough to document their public surface.
- **Changed appearance, behavior or API:** update the affected stories,
  arguments, variants, examples and fixtures alongside the implementation.
  Cover relevant states such as empty/populated, disabled, selected, validation,
  loading/progress and failure. Only expose controls the preview actually uses.
- **New repeated pattern:** consolidate it in the shared UI layer and adopt it
  in its real consumers, then document it in Storybook. Component styles should
  express layout or intentional variants rather than duplicate a primitive's
  control face, focus, disabled or interaction rules.
- **Rename or removal:** update catalogue metadata, imports and examples, and
  remove obsolete fixtures. Keep the catalogue registry as the source of truth;
  do not add a parallel inventory of component names or hard-code story counts.

Before reporting UI work done, run `npm run check:ui` (also included in lint)
and inspect the affected stories in the running app. Check the relevant
appearance presets, narrow widths, keyboard/focus behavior and supported states.
For lifecycle or interaction changes, also verify switching stories, resetting
fixtures and closing the program, with appropriate regression tests. The static
audit catches wiring and coverage omissions; it does not prove a preview is
correct or replace browser verification. Fix missing coverage rather than
weakening the audit or adding an exclusion for convenience.

Keep fixtures isolated and disposable: previews must not modify real documents,
workspace history or global appearance. Every subscription, observer, timer,
popover/dialog and GPU resource must end with its preview lifetime. Preserve the
existing lazy loading and instantiate only the selected story.

The **storybook** program lives under System. It is an in-app catalogue of the
actual custom elements, including the composed ticket wizard, sketch controls,
workspace chrome and standalone shared controls. It uses lit-html like the rest
of the app; there is no separate rendering framework or external Storybook build.

`src/storybook/stories.ts` assembles the catalogue. Each story declares its
searchable metadata, variants, arguments and a factory returning an element,
its connection lifetime and its event stream. Composition belongs to this
program layer. The shell in `components/storybook/` accepts plain views and
never imports the program registry or the components it demonstrates.

Only the selected story is instantiated. Switching stories, changing variants
or resetting unsubscribes the previous connection before mounting a fresh
fixture. Argument changes update the existing element. Search, preview width,
appearance overrides and event history are local to each Storybook window.
`HOLDING.storybook` is null: example documents and controls never enter the
workspace snapshot.

`program-demo.ts` runs existing program compositions against an isolated
`AppState`, backed by the pure reducer in `sandbox.ts`. It has no reference to
the real workspace's documents or command sink. Document/settings commands
update the fixture; workspace actions are logged only. The feedback stream is
bounded by an AbortController lifetime, so its internal subscriptions cannot
keep a closed preview or animation alive. Voice and drums use silent component
fixtures rather than starting audio engines. A failed preview becomes an error
view without preventing another story from opening.

To add a component example, add its story to the relevant catalogue module.
Prefer its real program composition when available; shared controls have small
standalone fixtures. Declare only controls the example supports, supply useful
variants and usage, and keep every connection in the returned lifetime. Appearance
previews read the existing appearance documents and apply their variables only
to the preview stage; they never change the app's selected look.

## Tooling

- Node **24 LTS**. Do not assume the host has it — `nvm use` reads `.nvmrc`, and
  Docker is the fallback that needs no local Node at all.
- `docker compose up dev --build` for the dev server; `npm run docker:build`
  exports `dist/` via a BuildKit `--output` stage.
- **Prefer conventional, idiomatic setups over clever ones.** An unusual
  arrangement will be questioned and should be justified or dropped. If the
  ecosystem has a standard way to do something, use it.
- Before reporting done: `npm run typecheck`, `npm run lint`, `npm run format`,
  `npm test`.
- **Tests are Vitest, beside the module they cover** (`shared/tickets.ts` → `shared/tickets.test.ts`),
  and only for pure code: folds, geometry, the muxers. That is the payoff of the
  layering — anything worth testing is a function of its arguments, so a test
  is a call and an assertion, with no DOM, no GL and no mocks. A business-logic test that wants
  the DOM is a sign the logic it checks sits in a component instead of a pure
  sibling. Byte formats are tested by parsing what they write (the WebM test
  walks the EBML tree; the zip test reads the directory back), not by comparing
  against a stored file. The first run found a real bug: section stepping
  followed creation order, not the reading order documented above.

Rendering integration tests use `.render.test.ts` in Vitest's `ui` project with
Happy DOM. Other `.test.ts` tests run in the `logic` project under Node. DOM tests
cover the RxJS/lit-html boundary, keyed identity, focused edits, custom-element
attributes and cleanup; reducers remain tested as pure functions. Browser
verification still covers actual layout, popovers, dialogs and GPU rendering.

## Performance

Measured, not guessed. The method that worked:

- **The pane must be visible.** A hidden pane reports `document.hidden`, rAF runs
  at about 1 fps and every number is wrong; check before measuring.
- **Frame gaps** from a rAF loop (p95, worst, frames over 25 ms) and the
  **Long Animation Frames** API, which attributes any frame over 50 ms to its
  scripts and forced layout without any setup.
- **The JS Self-Profiling API** for where time goes under 50 ms. It needs the
  `Document-Policy: js-profiling` response header; add it to `server.headers` in
  `vite.config.ts` for the session and take it out again.
- Gestures as scripted pointer and ctrl+wheel events along closed paths, so a
  run ends where it began; startup on a production build (`vite preview`),
  never the dev server's unbundled modules.

Baselines at the time of writing (four windows, 2x display): idle and paused
costs nothing (no frame loop runs); playback 2 ms/s of script; window drag,
canvas pan, orbit, scrub and typing all hold 60 fps; startup paints at about
100 ms with 5 MB of heap; fifteen sketch launch-and-close cycles leave heap, DOM
and GL contexts where they started. The three hot spots found — strip canvas
reallocation, sketch buffer reallocation during zoom, the zip's CRC — are fixed
above. Web workers were considered and are not needed: nothing measured is
main-thread bound except the PNG read-back.

**A window out of view does no per-frame work.** Each window's `shown` is
derived from the camera, the viewport and its box (`onScreen`, with a margin of
120 screen pixels, so it starts drawing just before it slides in), and
`scoped` withholds its clock while it is false: the playhead, the clock, the
pace and everything built on them stop arriving, so a sketch, a pedal view, a
signal, a plot or a gate pauses with no code of its own and picks up at the
current moment when it comes back. Programs that are heard as well as seen
(voice and drums) are `audible` and keep their clock, or panning away would
stop the music. An export snapshots its request when it starts, so leaving
the view does not stall it. With four clocks playing, script per frame went
from 2.2 ms with 38 of 56 windows in view to 0.1 ms with none.

The other limit is the browser's: a page keeps at most **16 WebGL contexts**
and silently loses the oldest past that (measured). That is why sketch windows
and their strips, and pen windows, draw through the one engine: it is the only
`getContext('webgl2')` in the app, and an export makes a second one only while
it runs. **The engine recovers from a lost context**: `engine$`
completes when its canvas reports the loss and `repeat` makes a fresh one, and
because every picture is a recipe and time is replayed, every window simply
draws again, simulations included. Forcing the loss with sixteen throwaway
contexts left every window drawing.

**Many windows stay cheap because nothing per window scans every window.**
Logic gates are tiny windows, so the canvas must hold hundreds. A drag move at
161 windows took 8.8 ms and now takes under 1 ms, from four rules:

- **A window finds itself through `index$`**, one `Map` of id → process,
  position and last index built once per workspace change. Each window derives
  its slot, store, follows and clock from one entry stream deduplicated by
  reference, so a drag elsewhere leaves it untouched.
- **Menus and wiring read `structure$`**, which emits only when stores or some
  process's `store` or `follows` reference changes (`sameStructure`). A drag or a
  raise keeps every one of those references. Lookups of a store's owner read
  `stores$`, never the whole workspace.
- **`inputGroups` precomputes per call**: one `dependentsOf(linked, store)` set
  stands in for a `closesLoop` per option, and one user count map for a scan per
  option.
- **Whole-canvas derivations are linear or swept.** `listed` numbers windows
  with one running count per program, behind one shared `Intl.Collator` (a
  `localeCompare` with options builds a collator per comparison and cost 8 ms
  at 200 windows). `seamsOf` only tries pairs whose columns meet, swept by left
  edge, and returns exactly what checking every pair returns, which a test pins.

Measure with a scripted drag of one window (60 synthetic `pointermove`s,
synchronous time per move) at 11, 71, 161 and 200 windows, and profile with the
JS Self-Profiling API when a number surprises you: the first guess here (the
per-window selectors) was right in kind and wrong in size.

## Verifying UI changes

The app must actually be looked at, not just compiled. Note that an embedded /
hidden browser pane reports `document.hidden === true`, which **throttles
`requestAnimationFrame` and suppresses `ResizeObserver` delivery entirely**.
It also **freezes CSS transitions mid-flight**, so `getComputedStyle` keeps
reporting the pre-transition value. Anything driven by frames, resizes or
transitions will look broken there, and a transitioned property can read as the
exact opposite of what the CSS says. Force a frame with a screenshot, then read
the DOM — do not conclude the app is broken from a timing-based probe alone.
