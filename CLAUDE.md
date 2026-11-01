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
cannot keep it from covering. It needs `preserveDrawingBuffer`, set on every
canvas, or the browser may hand back a cleared buffer. `prepare` clears the
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
  (`simulated$`): kept across every other change, so a knob or a camera drag
  never resets the simulation, and released when either changes. The live
  sketch, the thumbnails and an export each own their own, in their own context.
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

**There is no global panel any more.** `duration` was the last knob in Tweakpane,
and it is genuinely global — the playhead is one clock for the whole app — but
global state does not need a global widget. It is an `AppInput` like `scrub`: each
timeline's transport emits `duration`, `main.ts` folds the latest, and every
timeline reads it back, so two timelines edit one clock. Before adding a knob,
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
viewport, and the reducer centres the window on whatever part of the canvas is in
view, cascading by `launched % 8` so instance two does not land exactly on
instance one. Quitting is
the window's own close button — ordinary chrome on every window, not a
per-program affordance.

Programs live in `src/programs/<name>.program.ts` and nowhere else. A component
folder that grows a file naming a window is the mistake this layer exists to
prevent — that file is a program, and it belongs one level up.

**The dependency arrow only ever points down.** Nothing under `components/` may
import `program.ts`, `workspace.ts`, `process.ts`, `toolbar-host.ts`,
`settings.ts`, `state-store.ts` or the `appearance*.ts` modules; the check is one grep and it is worth running. This is
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
`adoptedStyleSheets`. There is no framework and no second state model — the
element is a DOM container, the streams stay outside it.

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
nothing about what it contains; the content component owns no chrome and does not
know it is in a window. Keep that line: the moment a content component reaches
for its own title bar or placement, the two are welded together again and neither
can be reused. A window's inputs are a `WindowView`: a frame plus a `kind`, either
`floating` (positioned and sized by its frame) or `fitted` (positioned by its
frame but sized by its content). Every program window is `floating`, so
`Program` has no `kind` at all; only the floating toolbar's window is `fitted`,
because its size is its row of tiles.

**Every window is the same window.** There is no per-window chrome, no mode, and
no window that another one has to be special-cased around. A feature that only
one window can use — the terminal's docking was one — buys a branch in
`WindowView`, a branch in `connect$`, a button in the shared title bar, a state
reducer, a keyboard map and an `AppState` field, all to serve a single window. If the
next such feature is worth that, it is worth making it work for every window.

**Nothing is declared in `index.html`** beyond the script tag and the favicon link
(`public/favicon.svg`, a rippled dot lattice with a dark variant), and no window is
mounted by hand. `main.ts` holds nothing but the list of programs, and a window's
existence is
a subscription: `liveProcess$` creates the `hks-window` in a `defer` factory and
removes it in `finalize`, with its views merged in as `ignoreElements` side
pipelines so one subscription both drives the DOM and reports back. Launching and
quitting is therefore just
`switchMap(running => running ? liveProcess$(...) : EMPTY)` over the processes
the workspace fold holds. Adding a program is one entry in the
table; nothing else in `main.ts` names it.

**The toolbar is chrome, not a program.** Its tiles only launch: a program can
run any number of times, so "this program is running" says nothing worth lighting
up. The toolbar must not itself be launchable — it is mounted once by
`main.ts`, in the canvas's `chrome` slot, outside the zoomed layer. Its tiles are
built with
`createElementNS`, never `innerHTML`: a `Program.icon` is path data on a 24x24
viewBox, so an icon can never be markup. And it takes `string`s out and back in,
narrowed by `isProgramId`, because a component may not know what a `ProgramId`
is.

It docks to any edge, retracts, or floats. Where it sits is `ToolbarState` in the
workspace fold, a union in which only `docked` carries `retracted` — a floating
toolbar has nothing to slide away. Floating is a subscription exactly like a
process: `toolbarHost$` opens an ordinary `HksWindow` in a `defer`, moves the
toolbar into it, and in `finalize` moves it back and removes the window. Moving
rather than rebuilding keeps the toolbar's listeners. That window's `quit` docks
it back to `lastEdge`, and its deltas are applied as screen pixels, unlike a
process window's, because the chrome slot is not zoomed. When retracted the tray
takes no pointer events; only the tab does.

Do not "improve" this by mounting eagerly and hiding closed windows with CSS.
The point is that a closed window holds no subscriptions at all — no `rAF` loop,
no listeners, no GL draws — which a `display: none` window would.

**The graph has a cycle and it is closed by ordering, not a `Subject`.** Windows
emit the workspace actions that produce their own frames: `signals$` carries
`WorkspaceAction`s out of every open window, `workspace$` folds them, and
`slot$(id)` hands the frames back in. The floating toolbar closes the same kind
of loop, which is why `toolbarGestures$` also enters the fold through a `defer`. Two things make it safe, and both are load-bearing:

- A program's `connect$` is a **function of `AppState`**, called from inside
  `switchMap` — long after `state` is initialised. Storing finished streams in
  the table instead would evaluate the cycle at construction time.
- `startWith(seed)` sits **before** `shareReplay`, so the seed is in the replay
  buffer before the source is subscribed and the windows mount. A window that
  subscribes to `workspace$` while mounting reads the seed rather than hanging.

The tool is drawn as **paper-like windows**: one panel colour with no header band,
a hairline `--edge`, a 14px radius and a soft `--shadow`, a transparent title strip
holding the program's icon and its name, and a close button that only shows on
hover or focus. The frontmost window is **focused**, which the window marks with
`data-focused` but deliberately does not style — a ring around it was tried and
removed as noise. That chrome lives once in `components/window/window.css`. Interiors
follow it — Geist for UI text, Geist Mono for code, readouts and clocks, both as
`--font-ui` / `--font-mono` from `styles.css` — and nest no frames of their own; a
well (`--well`, rounded) marks an editable area instead of a border. The design
these follow is the Claude Design canvas "hakase — modern redesign".

**Every program fills whatever window it is given.** The window body is a flex
column and each content component sets `block-size: 100%` on its host, so a
window resized taller or narrower reflows its content instead of leaving it
parked at the top. Two patterns carry the rest:

- A footer (the task manager's, the todo's) takes `margin-block-start: auto`, so
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

**The todo list is a document every todo window shares**, like a formula's text:
`hks-todo` emits `TodoCommand`s (`add`, `toggle`, `remove`, `clear-done`), `main.ts`
folds them with the pure `reduceTodos` into one `TodoList`, and every todo window
reads `AppState.todos$` back. Item ids come from a counter kept in the list
(`made`), like `launched` for processes, so a deleted item's id is never reused.
The list is saved in the snapshot. The draft in the input box is the one piece
of state the component keeps to itself — it is not app state, and it is cleared
after a submit. **Read it and clear it from one shared listener** (`submitted$`,
`share()`d): with two `submit` listeners, one reading and one clearing, the
order is subscription order, and deferring the clear does not save it — on a
real key press the browser runs microtasks between listeners, so an `asap` clear
lands before the read. A scripted `requestSubmit()` does not, which is why only
real typing showed the bug: test input with real events.

**Rows reorder by dragging their grip.** `drags$` is one shared gesture stream —
`moving`, then `dropped` or `cancelled` — read twice: `connect$` paints the
indicator from it (the dragged row fades, a line marks the drop) and `commands$`
turns a drop into `{ kind: 'move', id, to }`. Nothing in the list moves until the
drop, so the rows' midpoints stay put for the whole drag and `dropIndex` simply
counts how many of the _other_ rows sit above the pointer. That is why `to`
counts positions in the list without the moved item, and why `reduceTodos`
removes it before inserting. The gesture ends on the document, filtered by
`pointerId`, for the same reason the window's do; a cancel moves nothing.
The grip is a `<button>`, so it is focusable, and ↑/↓ on it move the row one
place. The list is rebuilt on every change, so `connect$` reads which grip had
focus before `replaceChildren` and focuses its replacement after. The keydown is
`preventDefault`ed because the canvas reads unmodified arrows as section steps
and skips any key already handled — that `defaultPrevented` check is the whole
contract between them.

**Sections are named borders on the canvas**, for grouping programs by place.
They live in the workspace (`Workspace.sections`, saved with it) as an id, a name
and a world `Rect`. **Which windows a section holds is derived, never stored**:
`holds` asks whether a window's middle lies inside, so dropping a window into a
section or dragging it out needs no bookkeeping. Dragging a section's label
moves it and everything it holds in one reducer step (members measured before
the step); its corner resizes it; double-clicking the name renames it; the ×
deletes the section and leaves its windows where they are. **+ section** in the
navigator frames the current view.

`hks-sections` draws them in the world layer, under the windows, and only labels
and corners take the pointer, so the inside of a section is still ground you can
pan. Two traps in its CSS: the host and the sections set **no `z-index` and no
`transform`** — either creates a stacking context, and the labels (which do set
a high `z-index`) would be trapped under the windows. That is why sections are
placed with `left`/`top`. And they are updated in place by id, never re-inserted:
moving a node drops the focus of a name being typed.

The name floats in a gap in the top border, with nothing painted behind it. That
gap is a real `<fieldset>` and `<legend>`: the browser opens the border around
the legend, which no background patch could do over the dotted ground. The gap is
exactly the legend's width, so only the name may set it: the input sizes to its
text with `field-sizing: content`, and the × is positioned out of the flow
beside it, or the gap grows lopsided on the × side. The
rename is read from `change`, and **`change` is not a composed event**, so it
never leaves the shadow root — it is listened for on an inner `.layer`, not on
the host where `click`, `dblclick` and the pointer events (all composed) arrive.

**Jumping to a section flies the camera there.** The navigator, with its map
open, lists the sections; clicking one emits a jump, and `main.ts` turns it into
a stream of `set-camera` actions. `flight()` in `shared/camera.ts` is van Wijk
and Nuij's smooth zoom-and-pan: one curve that pulls back, travels and closes in,
pulling back further the further it goes (`RHO`), with a duration that grows
with the distance. `animationFrames()` drives it through `switchMap`, so a
second jump replaces the first, and `takeUntil` any pan, zoom or key ends it, so
the user can always take the camera back. A flight reads the camera from the
fold it feeds, so it enters through a `defer` like the toolbar's gestures.

**Sections are also slides.** With nothing editable focused, ←/→ and
PageUp/PageDown step to the previous or next section in reading order (top to
bottom, then left to right). `steppedSection` in `src/commands.ts` decides from
the camera alone: if the view's centre is inside a section it steps from there,
otherwise it goes to the nearest one first. A step is just another jump, so it
flies, and a pan cancels it like any other flight.

**The navigator** (`hks-navigator`, bottom right, in the chrome slot) holds the zoom
controls and a minimap. `minimapOf` in `navigator.ts` maps every window frame and
the visible world rect into a fixed box with one uniform scale; the component only
places those rects. The minimap is closed by default and its open state lives in
the workspace fold (`toggle-minimap`), for the same reason as every panel that can
cover a control.
Slotted children stay in the light DOM, so `main.ts` still finds them with
`requireElement` and their own shadow roots are untouched. Everything else is a
window in its own right — a control that belongs to the sketch conceptually is
not therefore part of its chrome, and the timeline learned that the hard way.

## Windows

Windows live on an **infinite canvas**. `hks-canvas` holds a `.world` layer
transformed by a `Camera` (`screen = world * zoom + (x, y)`); windows are
appended as its light-DOM children, so the transform and the appearance's custom
properties reach them, and a frame is in world units. Drag the background or
wheel over it to pan, ctrl/cmd+wheel (a trackpad pinch sends the same) to zoom
around the pointer, ctrl/cmd `=` `-` `0` from the keyboard, and the navigator has
zoom, reset and fit. A plain wheel over a window is left alone, so textareas
still scroll. The dot grid is a CSS gradient whose size and offset follow the
camera, coarsened in powers of two as you zoom out — there is no grid DOM.

**Window deltas are divided by zoom in the reducer**, not in the window: the
pointer moves in screen pixels and the frame is in world units, and doing it in
`reduceWorkspace` keeps the camera and the frames in one `scan` with no
`withLatestFrom`. Sliders inside windows read their input through
`getBoundingClientRect`, which already includes the transform, so they work at any
zoom; their layout reads `offsetWidth`, which does not, and that is also right.

A sketch renders at `devicePixelRatio * zoom`, stepped to 0.25 by `steppedRatio`
so a wheel zoom does not reallocate the drawing buffer on every tick, and capped
at 2048px a side by `cappedRatio`. The program passes in the stepped ratio and the
component applies the cap, because the size already reaches the component
through `params$` — passing it in again would be a second path into one
`combineLatest`. Stepping alone was not enough: a ctrl+wheel zoom still crossed a
step every few ticks, and at the cap each reallocation took 50 ms. So `ratio$`
waits until the zoom has settled for `SETTLE_MS` (150 ms) before it emits, and in
the meantime CSS scales the old buffer; the first value applies at once, or a
sketch would open late.

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
on top. Resizing does not propagate, but it is magnetic: a resized edge snaps
to the edges of the windows it is linked to, so a window stacked under another
locks to its width. Closing a window closes only that one.

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
rested, every window's settings, and the todo list. `persistState$` takes one `combineLatest` of
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

**Undo is a fold around the fold.** `reduceHistory` wraps `reduceWorkspace` in a
`History` of `past`, `present` and `future` (100 deep), and `main.ts` scans that
instead, mapping out `present`. `stepOf` sorts actions: launch, quit, links and
section edits are steps of their own; a move or resize **joins** the previous
step while it is the same gesture on the same id, so one drag is one undo rather
than one per pointer move; a `raise` breaks the join; everything else (camera,
toolbar, minimap) is not history at all. Undo restores the windows but
`keepingView` carries the current camera, toolbar and minimap through, because
undoing a drag must not also fling the view back to where it was. ⌘Z and ⇧⌘Z
(or ⌘Y) come from the canvas's `edits$`, which ignores keys whose
`composedPath()[0]` is editable — a textarea inside a shadow root is retargeted
to its host, so `event.target` alone would steal the editor's own undo.

## The command palette

⌘K (Ctrl+K) opens `hks-palette` from anywhere, in the chrome slot. It is a
component like any other: `opens$`, `closes$` and `picks$` out, `connect$(commands$,
open$)` in, and it knows commands only as `{ id, label, hint }`. What exists is
derived in `src/commands.ts`: `commandsOf(programs, sections)` lists launches,
section jumps, slide steps, undo/redo, fit, reset, the minimap, looks and the
toolbar's placements, and `pickedOf` parses a picked id back into a `Picked`
union, which `main.ts` routes into the same streams the toolbar, navigator and
appearance editors already feed. The palette therefore adds no behaviour of its
own — every command is something another control could already do — and a new
command is one entry in `commandsOf` plus one case where it is routed. Filtering
is every typed word appearing in the label or hint, as a `combineLatest` of the
commands and the query, not a remembered list.

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

That picture's canvas is **never resized down**. The number of visible tiles and
their width change on every pinch tick and every time playback pages the strip,
and reallocating a canvas that size (up to the GPU's limit at 8x supersampling)
took up to 100 ms — a pinch ran at 32 fps. `growSurface` only grows it, by half
at least and capped at `MAX_VIEWPORT_DIMS`, the strip is drawn into its bottom
rows (GL's origin is bottom-left), and `createImageBitmap(canvas, x, y, w, h,
resize)` crops and averages it down in one step. Copying out rather than
`transferToImageBitmap` also keeps the buffer instead of handing it over each
frame.
Its host has `contain: inline-size`, which is load-bearing: without it the
thousands-of-pixels track sets the controls' intrinsic width, and the strip
pushes past the window instead of scrolling inside it.

**Thumbnails and export never touch the live canvas.** Each renders in a GL
context of its own (`createOffscreenSurface` on an `OffscreenCanvas`, wrapped in
`offscreen$` so unsubscribing releases it with `WEBGL_lose_context`), compiling
the same formula text the sketch shows. That is what decoupled export from the
screen: resolution is the export's own (480 to 2160 px on the long side, aspect
from the sketch, rounded even because VP8 and VP9 reject odd sizes), the canvas
zoom no longer matters, the sketch keeps playing while you export, and there is
no capture clock overriding the playhead any more. The thumbnail context exists
only while the Animation tab is open — `switchMap` on the tab — and the export's
only while exporting.

`prepareStill` takes a scale of pixels per **sketch CSS pixel**, not a device
ratio, because dots are sized in CSS pixels: an export at 2160 px scales them up
with the picture.

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
  strip at 8x would not fit one canvas — and `createImageBitmap` with
  `resizeQuality: 'high'` averages them down; CSS scaling of a canvas is bilinear
  and skips most of the pixels. 4x still read pale on dense spikes; 8x matched a
  high-quality downscale of the sketch itself.

The fragment shader's two size rules — the anti-aliasing band and `SMALL_DOT`,
below which a dot keeps its soft edge — are in the **live sketch's** pixels:
`uDotScale` is target pixels per on-screen pixel, 1 for the sketch and
`(picture px / sketch CSS px) / devicePixelRatio` for a thumbnail. Measured in the
thumbnail's own pixels, the same dot would be "small" there and crisp in the
sketch, and dense areas came out half as dark. Exports keep 1: they are their
own picture, not a view of the screen. Thumbnails draw with trails off, since
each tile stands alone; an export with trails plays the loop once unrecorded
first, so the first kept frame carries the trail of the last.

**The encoder paces the export; there is no timer.** `export$` `concatMap`s over
the frame list: it draws a frame, then hands the canvas to the writer and waits
for it before the next. For WebM the writer is WebCodecs' `VideoEncoder`, given
each frame's exact timestamp and a key frame every two seconds, and `drained`
waits on its `dequeue` event while more than two frames are queued, so a long
export never holds every frame in memory. For PNG frames it is
`convertToBlob`. A throttled tab therefore only exports slower, never wrong.
`exhaustMap` ignores a second Export while one runs, and Export is disabled in
place rather than swapped for Cancel, or a double-click would start and stop
one. The surface and writer stay open until unsubscribed, which is why `export$`
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
- **`src/main.ts`** — the graph and nothing else. Build `playhead$`, fold the
  window actions, hand back an `AppState`, subscribe once. No `tap`, no DOM, no GL
  imports — `compileFormula$` exists so that the last of those stays true.

`src/lib/` sits underneath everything: `dom`, `math`, `rx`, `color`, `storage`.

The program layer sits at the `src/` root, above the components it composes:
`program.ts` (identity and contracts), `workspace.ts` (processes, camera and
toolbar, and their reducer), `settings.ts` (what each window remembers),
`state-store.ts` (the one snapshot), `process.ts` (`liveProcess$`),
`toolbar-host.ts`, `appearance.ts`, `appearances.ts`,
`main.ts`.

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

    Two hundred and twenty-three of them survive in `src/` today, every one a single line. Treat that
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

The frames are gated by that same fold's `playing && !held`, so `createTransport$` reads
itself through a `defer`, the same ordering trick as the workspace cycle. Pausing
at the end therefore also stops the `rAF` loop, and so does a hold: held is not
paused, so `playing` stays true and playback resumes from wherever the pointer
let go, wherever that pointer was (any of the controls above, since they all
feed the one fold). `playhead$`, `playing$` and
`looping$` in `AppState` are projections of the one stream. It is
`refCount: false`, so closing the last timeline does not rewind the clock.

Deltas rather than `elapsed` are load-bearing: `animationFrames()` restarts its
clock on every subscription, so resuming with `elapsed` would jump the playhead
back to the offset it started from. That is what `pairwise()` is doing there.

`duration: 0` no longer means paused — the button does that now — so
`defaultDuration` seeds at 8 seconds and `parseDuration` rejects anything not above 0. The reducer still guards against 0,
which now means only "a loop of no length cannot advance".

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

Compilation is the middle stage of `inputs -> formula -> render`, so it is a free
function — `compileFormula$(gl, source$)` in `components/sketch/compile.ts` — and not a
method on the canvas element. It _produces_ app state rather than displaying it,
which is the line: `connect$` connects app state to the UI, and anything that
derives state instead is a pipeline stage. The element owns the canvas and
exposes its `gl` for the stage to compile into. Failure is a value, not an
exception. **Each sketch compiles for itself**, into its own GL context, from the
formula it picked — so failures are per formula, not per app. Because a failure
means the sketch's program stream simply does not emit, `combineLatest` keeps the
last shader that linked and the canvas never blanks. Preserve that property. `connect$` also deletes each superseded `WebGLProgram`
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

## Tooling

- Node **20.19+**. Do not assume the host has it — `nvm use` reads `.nvmrc`, and
  Docker is the fallback that needs no local Node at all.
- `docker compose up dev --build` for the dev server; `npm run docker:build`
  exports `dist/` via a BuildKit `--output` stage.
- **Prefer conventional, idiomatic setups over clever ones.** An unusual
  arrangement will be questioned and should be justified or dropped. If the
  ecosystem has a standard way to do something, use it.
- Before reporting done: `npm run typecheck`, `npm run lint`, `npm run format`,
  `npm test`.
- **Tests are Vitest, beside the module they cover** (`todo.ts` → `todo.test.ts`),
  and only for pure code: folds, geometry, the muxers. That is the payoff of the
  layering — anything worth testing is a function of its arguments, so a test
  is a call and an assertion, with no DOM, no GL and no mocks. A test that wants
  the DOM is a sign the logic it checks sits in a component instead of a pure
  sibling. Byte formats are tested by parsing what they write (the WebM test
  walks the EBML tree; the zip test reads the directory back), not by comparing
  against a stored file. The first run found a real bug: section stepping
  followed creation order, not the reading order documented above.

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

## Verifying UI changes

The app must actually be looked at, not just compiled. Note that an embedded /
hidden browser pane reports `document.hidden === true`, which **throttles
`requestAnimationFrame` and suppresses `ResizeObserver` delivery entirely**.
It also **freezes CSS transitions mid-flight**, so `getComputedStyle` keeps
reporting the pre-transition value. Anything driven by frames, resizes or
transitions will look broken there, and a transitioned property can read as the
exact opposite of what the CSS says. Force a frame with a screenshot, then read
the DOM — do not conclude the app is broken from a timing-based probe alone.
