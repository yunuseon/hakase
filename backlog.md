# Backlog

Work that is decided but not done, in the order it should be done. Each item
says what done looks like. When an item lands, delete it here and describe the
result in `AGENTS.md`, which says how the app _is_; this file says what is
next. An idea that is not decided yet belongs in a conversation, not here.

## The finish

The app gained a lot of capability and too little finish. The goal now is
subtle minimalism with one strong design language that every interaction
speaks, and the friction found while building the converters, attacked in
that language. An audit found the gaps: no motion vocabulary (eight
transitions, five durations, two easings, reduced motion honoured in two
places), no elevation system (about twenty hand-written shadows), four kinds
of focus ring, and the state menu drawn inside the zoomed canvas, microscopic
at 41% and running off the screen at 100%.

### The language

1. **Nothing hangs off a window at another scale.** What belongs to a
   window is part of the window and zooms with it: its menus, its pins, its
   tabs. The glass (screen-space, top layer) is only for what belongs to no
   window: the navigator, the palette, a select's list. To read a window, you
   come close to it.
2. **Quiet until wanted.** Secondary affordances (close, plugs, grips, the
   chip's menu) appear on hover or focus-within, with one fade; a coarse
   pointer shows them always. Nothing decorative is drawn that does not
   carry state.
3. **One motion vocabulary.** An easing and three durations as tokens:
   quick for hover and press, base for anything that opens, slow for what
   moves the canvas. Things enter by fading and settling a few pixels, and
   leave faster than they came. `prefers-reduced-motion` takes every
   duration to zero through the tokens alone.
4. **Four elevations, no others**: control (a thumb, a selected choice),
   surface (a window, the navigator), raised (a menu, a picker, a hint) and
   overlay (the palette, a dialog). A shadow written by hand is a bug.
5. **One focus ring**, as a token, and one pressed state.
6. **Accent is spent once per view**, on what matters most there: the
   playhead, the selected choice, the live wire. Everything else is ink,
   label or muted.

### In order

- **One sound switch.** One Listen in the navigator that unlocks audio for
  every voice and drum machine in view, with a small mixer for each one's
  level and mute. A window's own Listen stays, as a solo. Done when Light
  band sounds after one click.
- **Graphs you can hold.** Placing a blueprint flies the camera to fit what
  was placed. Any window folds to its title row, its pins still live and its
  traces still landing, saved with the window. Done when Light band can be
  folded down to its sketch and plot without losing a sound or a wire.
- **A first run that invites.** An empty canvas offers the starters as quiet
  cards, each placed with one click and the camera flown to it. Done when a
  fresh profile reaches a playing starter in two clicks.

## A core any client could drive

The core boots in Node and imports no view (see "The core, with no client" and
"The model and the layout" in `AGENTS.md`). What is left, in order:

- **The layers are checked.** A check in lint fails when a core module (the
  root modules, `graph/` modules the core composes, `shared/` outside `ui/`)
  imports `components/`, lit or a browser global, as the comment ceiling is
  checked. Done when a stray import fails `npm run lint`.
- **The store registry leaves the workspace.** Which stores exist and their
  names sit in `Workspace` beside window frames and the camera, so a client
  with no windows still carries a layout. Moving them into the documents
  touches the saved shape, so it migrates the snapshot. Done when a client can
  make and name a store with no window at all.

## Typed ports and converters

### Why

Every jack accepts a list of program kinds, and `driverIn` quietly turns each
kind into a number: a voice into its loudness, drums into a weighted mix of
hits, a gate into 0 or 1, an agenda into "in a block". Each of those
conversions makes a choice nobody can see or change, and it makes wiring an
agenda into a sketch's knob look like magic rather than like what it is: _read
my agenda as a number, this way, then use the number_.

So ports get **types** the user can see, a jack takes only its own type, and
getting from one type to another goes through a **converter**: a small program
on the canvas with the choice as its setting. Each converter window is one
reading, so two followers can read one agenda two ways without links carrying
any options. This is the app's idea, visible dataflow, applied to its own
hidden coercions.

### The types

| Type                                                       | Made by                              | Read by                                                |
| ---------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| clock                                                      | timeline                             | every playback input, read on                          |
| level                                                      | signal, converters                   | knobs, scene inputs, pedal knobs, compare, wave params |
| bit                                                        | gates                                | gate inputs                                            |
| picture                                                    | sketch, pedals                       | pedals, Output                                         |
| sheet                                                      | paint, pen                           | a sketch's paint input                                 |
| sound                                                      | voice, drums                         | converters                                             |
| schedule                                                   | agenda                               | a focus timer, converters                              |
| timer                                                      | focus                                | progress, converters                                   |
| tasks                                                      | tickets                              | progress, converters                                   |
| reading                                                    | (implicitly: timer, schedule, tasks) | progress                                               |
| zones, notes, habits, bookmarks, formula, theme, component | their own program                    | only their own windows (shared state)                  |

**Conversions.** Only a conversion with no choice in it may stay implicit.
`CONVERSIONS` lists every implicit one with a flag for whether it is meant to
retire; a test pins that every input accepts only its own type or one listed
there, so a new hidden coercion cannot slip in.

| From → to          | Today              | Plan                                          |
| ------------------ | ------------------ | --------------------------------------------- |
| bit → level        | `bitCurve`, 0 or 1 | stays implicit: nothing to choose             |
| timer → reading    | `focusReading`     | stays implicit: it is the timer's own summary |
| schedule → reading | `agendaReading`    | stays implicit, for the progress bar          |
| tasks → reading    | `ticketsReading`   | stays implicit, for the progress bar          |
| sound → level      | Envelope           | only through a converter (done)               |
| schedule → level   | Timing             | only through a converter (done)               |

### Converters are type pairs

The first five converters were named and built per source program (Timing,
Envelope, Kit, Phase, Done), which hid that each is one type turned into
another, and gave each its own little window with nothing shared. A converter
is a **pair**, `from → to`, generated from a table like pedals and gates: the
pair offers **readings** (the ways to do that conversion) and the output type
brings **modifiers** every converter making that type shares. Not one program
whose output type is a setting: a jack's type is known from its kind, which is
what state mode's compatible drops and the port test rely on.

Pairs, readings, the level modifiers, Shape, the bit converters, the clock,
city and habit converters and picture → level are in (see "Typed ports and
converters" in `AGENTS.md`).

Not planned: `level → clock` (a moving tempo breaks exact replay) and anything
into picture or sound, which sketches, pedals and voices already make.

## Tooling

**TypeScript 7, once typescript-eslint takes it.** TypeScript 7 is out, but
typescript-eslint 8.72 accepts `typescript <6.1.0`, and 7's programmatic API is
still `unstable/*`, which typed linting is built on. Done looks like:
`typescript@^7` with typescript-eslint's typed rules still running, typecheck,
lint and tests green. Its minimatch advisory (moderate, dev-only) should clear
with the same typescript-eslint release. `@types/node` stays on 24 while
`.nvmrc` does.
