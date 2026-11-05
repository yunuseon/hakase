export type Span = { readonly from: number; readonly to: number; readonly carried: boolean };

// Far enough ahead that a late frame never misses a note, near enough that an edit is heard at once.
export const AHEAD = 0.15;
// A frame that moves the playhead further than this was a scrub or a jump, not playback.
const JUMP = 0.25;

export type Frame = {
    readonly t: number;
    readonly now: number;
    readonly seconds: number;
    readonly playing: boolean;
};

export type Strike<S extends Span> = {
    readonly at: number;
    readonly held: number;
    readonly span: S;
};

// Past this, the audio clock and the playhead have truly parted, and the anchor is set again.
const DRIFT = 0.03;

// One moment on both clocks, kept for the whole run: each frame's own pairing wobbles by up to a frame.
type Anchor = { readonly audio: number; readonly at: number; readonly seconds: number };

export type Schedule = {
    readonly last: number | null;
    readonly until: number;
    readonly loops: number;
    readonly anchor: Anchor | null;
};

export const unscheduled: Schedule = { last: null, until: 0, loops: 0, anchor: null };

const heldOf = (notes: readonly Span[], note: Span) => {
    const first = notes[0];

    return note === notes.at(-1) && first?.carried === true
        ? note.to - note.from + first.to
        : note.to - note.from;
};

export const scheduled = <S extends Span>(
    { last, until, loops, anchor }: Schedule,
    { t, now, seconds, playing }: Frame,
    notes: readonly S[],
): { readonly schedule: Schedule; readonly strikes: readonly Strike<S>[] } => {
    if (!playing || seconds <= 0) {
        return { schedule: unscheduled, strikes: [] };
    }

    const advance = last === null ? null : (((t - last) % 1) + 1) % 1;
    const jumped = advance === null || advance > JUMP;
    const loop = jumped ? 0 : last !== null && t < last ? loops + 1 : loops;
    const position = loop + t;
    const kept =
        anchor !== null &&
        !jumped &&
        anchor.seconds === seconds &&
        Math.abs(anchor.audio + (position - anchor.at) * seconds - now) < DRIFT;
    const held = kept ? anchor : { audio: now, at: position, seconds };
    const ahead = position + AHEAD / seconds;
    const from = jumped ? position : until;
    const strikes = [loop, loop + 1].flatMap(round =>
        notes.flatMap(note => {
            const onset = round + note.from;
            const inside = (jumped ? onset >= from : onset > from) && onset <= ahead;

            return note.carried || !inside
                ? []
                : [
                      {
                          at: held.audio + (onset - held.at) * seconds,
                          held: heldOf(notes, note) * seconds,
                          span: note,
                      },
                  ];
        }),
    );

    return { schedule: { last: t, until: ahead, loops: loop, anchor: held }, strikes };
};
