export type Envelope = {
    readonly attack: number;
    readonly decay: number;
    readonly sustain: number;
    readonly release: number;
};

export type Partial = {
    readonly shape: 'sine' | 'triangle' | 'sawtooth' | 'square';
    readonly ratio: number;
    readonly level: number;
    readonly detune: number;
    readonly fade: number | null;
};

export type Source =
    | { readonly kind: 'partials'; readonly partials: readonly Partial[] }
    | {
          readonly kind: 'fm';
          readonly ratio: number;
          readonly index: number;
          readonly fade: number;
          readonly level: number;
      }
    | {
          readonly kind: 'string';
          readonly sustain: number;
          readonly brightness: number;
          readonly level: number;
      }
    | {
          readonly kind: 'noise';
          readonly band: number;
          readonly q: number;
          readonly fade: number;
          readonly level: number;
      };

export type Instrument = {
    readonly label: string;
    // Calibrated so instruments sit at one loudness: measured, not guessed, from offline renders.
    readonly gain: number;
    readonly sources: readonly Source[];
    readonly amp: Envelope;
    readonly filter: {
        readonly cutoff: number;
        readonly sweep: number;
        readonly fade: number;
    } | null;
    readonly vibrato: {
        readonly rate: number;
        readonly cents: number;
        readonly delay: number;
    } | null;
};

const partial = (
    ratio: number,
    level: number,
    shape: Partial['shape'] = 'sine',
    fade: number | null = null,
    detune = 0,
): Partial => ({ shape, ratio, level, detune, fade });

export const INSTRUMENTS = {
    piano: {
        label: 'piano',
        gain: 0.69,
        sources: [
            { kind: 'fm', ratio: 1, index: 1.6, fade: 0.9, level: 0.9 },
            { kind: 'partials', partials: [partial(14, 0.05, 'sine', 0.04)] },
        ],
        amp: { attack: 0.004, decay: 2.2, sustain: 0, release: 0.35 },
        filter: null,
        vibrato: null,
    },
    guitar: {
        label: 'guitar',
        gain: 1.81,
        sources: [{ kind: 'string', sustain: 3, brightness: 0.7, level: 1 }],
        amp: { attack: 0, decay: 2.5, sustain: 0, release: 0.08 },
        filter: null,
        vibrato: null,
    },
    harp: {
        label: 'harp',
        gain: 1.58,
        sources: [{ kind: 'string', sustain: 6, brightness: 0.35, level: 1 }],
        amp: { attack: 0, decay: 4, sustain: 0, release: 0.4 },
        filter: null,
        vibrato: null,
    },
    marimba: {
        label: 'marimba',
        gain: 0.95,
        sources: [
            { kind: 'partials', partials: [partial(1, 1), partial(3.93, 0.35, 'sine', 0.08)] },
            { kind: 'noise', band: 4, q: 1.5, fade: 0.01, level: 0.15 },
        ],
        amp: { attack: 0.002, decay: 0.8, sustain: 0, release: 0.12 },
        filter: null,
        vibrato: null,
    },
    bell: {
        label: 'bell',
        gain: 0.61,
        sources: [
            { kind: 'fm', ratio: 1.4, index: 2.6, fade: 2.4, level: 0.8 },
            {
                kind: 'partials',
                partials: [partial(2.76, 0.25, 'sine', 1.4), partial(5.4, 0.1, 'sine', 0.5)],
            },
        ],
        amp: { attack: 0.002, decay: 5, sustain: 0, release: 1.2 },
        filter: null,
        vibrato: null,
    },
    organ: {
        label: 'organ',
        gain: 0.43,
        sources: [
            {
                kind: 'partials',
                partials: [
                    partial(0.5, 0.35),
                    partial(1, 0.8),
                    partial(1.5, 0.3),
                    partial(2, 0.45),
                    partial(3, 0.25),
                    partial(4, 0.2),
                    partial(8, 0.1),
                ],
            },
        ],
        amp: { attack: 0.012, decay: 0.1, sustain: 0.9, release: 0.07 },
        filter: null,
        vibrato: { rate: 6.2, cents: 6, delay: 0 },
    },
    pad: {
        label: 'pad',
        gain: 1.23,
        sources: [
            {
                kind: 'partials',
                partials: [
                    partial(1, 0.45, 'sawtooth', null, -9),
                    partial(1, 0.45, 'sawtooth', null, 9),
                    partial(0.5, 0.3, 'sawtooth'),
                ],
            },
        ],
        amp: { attack: 0.45, decay: 0.6, sustain: 0.8, release: 1.1 },
        filter: { cutoff: 2.5, sweep: 1.5, fade: 1.2 },
        vibrato: null,
    },
    bass: {
        label: 'bass',
        gain: 0.76,
        sources: [
            {
                kind: 'partials',
                partials: [partial(1, 0.8, 'sawtooth'), partial(0.5, 0.5, 'square')],
            },
        ],
        amp: { attack: 0.004, decay: 0.35, sustain: 0.6, release: 0.08 },
        filter: { cutoff: 1.5, sweep: 3, fade: 0.25 },
        vibrato: null,
    },
    flute: {
        label: 'flute',
        gain: 0.54,
        sources: [
            { kind: 'partials', partials: [partial(1, 0.9), partial(2, 0.1), partial(3, 0.04)] },
            { kind: 'noise', band: 2, q: 2, fade: 10, level: 0.06 },
        ],
        amp: { attack: 0.07, decay: 0.15, sustain: 0.85, release: 0.12 },
        filter: null,
        vibrato: { rate: 5, cents: 12, delay: 0.25 },
    },
} as const satisfies Readonly<Record<string, Instrument>>;

export type InstrumentName = keyof typeof INSTRUMENTS;

export const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS).filter(isInstrumentName);

export function isInstrumentName(value: string): value is InstrumentName {
    return Object.keys(INSTRUMENTS).includes(value);
}

// One of setTargetAtTime's time constants: after three of them a stage is within 5% of where it is going.
export const STAGE = 3;

const approach = (from: number, to: number, elapsed: number, length: number) =>
    length <= 0 ? to : to + (from - to) * Math.exp((-elapsed * STAGE) / length);

// How loud a note is, `since` seconds after its strike, held for `held` seconds: the audio draws the same curve.
export const envelopeAt = (
    { attack, decay, sustain, release }: Envelope,
    since: number,
    held: number,
) => {
    const holding = (time: number) =>
        time < 0 ? 0 : time < attack ? time / attack : approach(1, sustain, time - attack, decay);

    return since < held ? holding(since) : approach(holding(held), 0, since - held, release);
};

export const ringOf = ({ amp, sources }: Instrument, held: number) => {
    const string = sources.some(({ kind }) => kind === 'string');
    const fading = amp.sustain === 0 ? amp.attack + amp.decay * 2 : Number.POSITIVE_INFINITY;

    return Math.min(held + amp.release * 2, fading, string ? 4 : Number.POSITIVE_INFINITY);
};
