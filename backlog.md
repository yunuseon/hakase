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

Pairs, readings, the level modifiers, Shape, the bit converters and the clock, city and habit converters are in (see "Typed ports and
converters" in `AGENTS.md`).

**Still to come: `picture → level`** (brightness, or a colour channel, of a
sketch's or a pedal's picture). It needs a read-back from the engine, which is
GPU work and the one main-thread cost measured so far (`convertToBlob`), so it
should read a small mip of the picture, not the whole of it.

Not planned: `level → clock` (a moving tempo breaks exact replay) and anything
into picture or sound, which sketches, pedals and voices already make.
