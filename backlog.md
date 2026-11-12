# Backlog

Work that is decided but not done, in the order it should be done. Each item
says what done looks like. When an item lands, delete it here and describe the
result in `AGENTS.md`, which says how the app _is_; this file says what is
next. An idea that is not decided yet belongs in a conversation, not here.

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

| Type     | Made by                              | Read by                                                |
| -------- | ------------------------------------ | ------------------------------------------------------ |
| clock    | timeline                             | every playback input, read on                          |
| level    | signal, converters                   | knobs, scene inputs, pedal knobs, compare, wave params |
| bit      | gates                                | gate inputs                                            |
| picture  | sketch, pedals                       | pedals, Output                                         |
| sheet    | paint, pen                           | a sketch's paint input                                 |
| sound    | voice, drums                         | (nothing yet but converters)                           |
| schedule | agenda                               | a focus timer, converters                              |
| timer    | focus                                | progress, converters                                   |
| tasks    | tickets                              | progress, converters                                   |
| reading  | (implicitly: timer, schedule, tasks) | progress                                               |

**Conversions.** Only a conversion with no choice in it may stay implicit.
`CONVERSIONS` lists every implicit one with a flag for whether it is meant to
retire; a test pins that every input accepts only its own type or one listed
there, so a new hidden coercion cannot slip in.

| From → to          | Today                    | Plan                                          |
| ------------------ | ------------------------ | --------------------------------------------- |
| bit → level        | `bitCurve`, 0 or 1       | stays implicit: nothing to choose             |
| timer → reading    | `focusReading`           | stays implicit: it is the timer's own summary |
| schedule → reading | `agendaReading`          | stays implicit, for the progress bar          |
| tasks → reading    | `ticketsReading`         | stays implicit, for the progress bar          |
| sound → level      | `voiceCurve`, `kitCurve` | retires into the Envelope and Kit converters  |
| schedule → level   | Timing                   | only through a converter (done)               |

### Converters, one at a time

The types, `CONVERSIONS`, the converter table and Timing are in (see
"Typed ports and converters" in `AGENTS.md`).

Each one: the table entry, its window, its story, a test of its reading, the
implicit conversion it replaces removed from every input's sources, and old
saved links migrated (or none, where the conversion never shipped).

1. **Envelope** (sound → level, voice). _Loudness_ (today's `voiceCurve`) or
   _pitch_ (the note, in octaves above the root). Retires voice from
   `driveInput` and `levelInput`; saved links from a knob to a voice are
   migrated by placing an Envelope beside the voice and relinking through it.
2. **Kit** (sound → level, drums). _Mix_ (today's `kitCurve`) or _one drum_.
   Retires drums the same way.
3. **Phase** (timer → level): how far through the focus timer's phase, or
   the block it follows. New: nothing implicit to retire.
4. **Done** (tasks → level): how much of a ticket list is done. A converter
   takes one type, so this is not folded into Phase.

### What typed ports make possible

- **Wave inputs take any level.** A signal's phase, offset and depth, a pen's
  x and y, a voice's pitch and the plot take signals only, because `waveOf`
  chains waves structurally. Letting them take a `Driver` lets a pen follow a
  Timing or an Envelope.
- **The state map shows types** on its ports, as state mode does.
- **Bits gate sound**: a voice or drum machine's volume takes a level, and a
  bit is a level, once the wave inputs take any level.
