import { curveOf } from '../../shared/curve.ts';
import {
    scheduled,
    unscheduled,
    type Frame,
    type Schedule,
    type Strike,
} from '../../shared/schedule.ts';
import {
    envelopeAt,
    INSTRUMENT_NAMES,
    INSTRUMENTS,
    isInstrumentName,
    type InstrumentName,
    type Instrument,
} from './instruments.ts';
import { sameWave, waveAt, waveOf, type Signal, type Wave } from '../../shared/signal.ts';

export const VOICE_PARAMS = ['pitch', 'volume', 'filter', 'pan'] as const;
export type VoiceParam = (typeof VOICE_PARAMS)[number];
export const isVoiceParam = (value: string): value is VoiceParam =>
    VOICE_PARAMS.some(param => param === value);

// The OscillatorNode's own names, so a shape is handed to the audio as it is.
export const SHAPES = ['sine', 'triangle', 'sawtooth', 'square'] as const;
export type Shape = (typeof SHAPES)[number];
export const isShape = (value: string): value is Shape => SHAPES.some(shape => shape === value);

export const SCALES = ['pentatonic', 'major', 'minor', 'chromatic', 'free'] as const;
export type Scale = (typeof SCALES)[number];
export const isScale = (value: string): value is Scale => SCALES.some(scale => scale === value);

export const ARTICULATIONS = ['pluck', 'drone'] as const;
export type Articulation = (typeof ARTICULATIONS)[number];
export const isArticulation = (value: string): value is Articulation =>
    ARTICULATIONS.some(articulation => articulation === value);

// The synth is the one oscillator that follows the pitch; every other instrument strikes a note of its own.
export const VOICE_INSTRUMENTS = ['synth', ...INSTRUMENT_NAMES] as const;
export type VoiceInstrument = 'synth' | InstrumentName;
export const isVoiceInstrument = (value: string): value is VoiceInstrument =>
    value === 'synth' || isInstrumentName(value);

export const ROOTS = { low: 24, high: 84 } as const;
export const DECAY = { low: 0.05, high: 2 } as const;
export const GLIDE = { low: 0, high: 0.5 } as const;

export type Voice = {
    readonly instrument: VoiceInstrument;
    readonly shape: Shape;
    readonly root: number;
    readonly scale: Scale;
    readonly articulation: Articulation;
    readonly decay: number;
    readonly glide: number;
    readonly volume: number;
    readonly sources: Readonly<Record<VoiceParam, string | null>>;
};

export const defaultVoice: Voice = {
    instrument: 'synth',
    shape: 'triangle',
    root: 48,
    scale: 'pentatonic',
    articulation: 'pluck',
    decay: 0.35,
    glide: 0.02,
    volume: 0.6,
    sources: { pitch: null, volume: null, filter: null, pan: null },
};

export type VoiceCommand =
    | { readonly kind: 'instrument'; readonly instrument: VoiceInstrument }
    | { readonly kind: 'shape'; readonly shape: Shape }
    | { readonly kind: 'root'; readonly root: number }
    | { readonly kind: 'scale'; readonly scale: Scale }
    | { readonly kind: 'articulation'; readonly articulation: Articulation }
    | { readonly kind: 'decay'; readonly decay: number }
    | { readonly kind: 'glide'; readonly glide: number }
    | { readonly kind: 'volume'; readonly volume: number }
    | { readonly kind: 'source'; readonly param: VoiceParam; readonly source: string | null };

const within = (value: number, low: number, high: number) =>
    Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : null;

const withNumber = (voice: Voice, key: 'root' | 'decay' | 'glide' | 'volume', value: number) =>
    value === voice[key] ? voice : { ...voice, [key]: value };

export const reduceVoice = (voice: Voice, command: VoiceCommand): Voice => {
    switch (command.kind) {
        case 'instrument':
            return command.instrument === voice.instrument
                ? voice
                : { ...voice, instrument: command.instrument };
        case 'shape':
            return command.shape === voice.shape ? voice : { ...voice, shape: command.shape };
        case 'scale':
            return command.scale === voice.scale ? voice : { ...voice, scale: command.scale };
        case 'articulation':
            return command.articulation === voice.articulation
                ? voice
                : { ...voice, articulation: command.articulation };
        case 'root': {
            const root = within(Math.round(command.root), ROOTS.low, ROOTS.high);

            return root === null ? voice : withNumber(voice, 'root', root);
        }
        case 'decay': {
            const decay = within(command.decay, DECAY.low, DECAY.high);

            return decay === null ? voice : withNumber(voice, 'decay', decay);
        }
        case 'glide': {
            const glide = within(command.glide, GLIDE.low, GLIDE.high);

            return glide === null ? voice : withNumber(voice, 'glide', glide);
        }
        case 'volume': {
            const volume = within(command.volume, 0, 1);

            return volume === null ? voice : withNumber(voice, 'volume', volume);
        }
        case 'source':
            return voice.sources[command.param] === command.source
                ? voice
                : { ...voice, sources: { ...voice.sources, [command.param]: command.source } };
    }
};

export type VoiceWaves = Readonly<Record<VoiceParam, Wave | null>>;

export type Sounding = { readonly voice: Voice; readonly waves: VoiceWaves };

export const soundingOf = (voice: Voice, signals: ReadonlyMap<string, Signal>): Sounding => {
    const wave = (param: VoiceParam) => {
        const source = voice.sources[param];

        return source === null ? null : waveOf(signals, source);
    };

    return {
        voice,
        waves: {
            pitch: wave('pitch'),
            volume: wave('volume'),
            filter: wave('filter'),
            pan: wave('pan'),
        },
    };
};

export const sameSounding = (a: Sounding, b: Sounding) =>
    a.voice === b.voice &&
    VOICE_PARAMS.every(param => {
        const x = a.waves[param];
        const y = b.waves[param];

        return x === null || y === null ? x === y : sameWave(x, y);
    });

const DEGREES: Readonly<Record<Exclude<Scale, 'free'>, readonly number[]>> = {
    pentatonic: [0, 2, 4, 7, 9],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const semitonesOf = (octaves: number, scale: Scale) => {
    const semitones = octaves * 12;

    if (scale === 'free') {
        return semitones;
    }

    const octave = Math.floor(semitones / 12);
    const into = semitones - octave * 12;
    const degree = [...DEGREES[scale], 12].reduce((best, step) =>
        Math.abs(step - into) < Math.abs(best - into) ? step : best,
    );

    return octave * 12 + degree;
};

export const semitonesAt = ({ voice, waves }: Sounding, t: number) =>
    waves.pitch === null ? 0 : semitonesOf(waveAt(waves.pitch, t), voice.scale);

export const frequencyOf = (note: number) => 440 * 2 ** ((note - 69) / 12);

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

export const noteName = (note: number) => {
    const nearest = Math.round(note);

    return `${NAMES[((nearest % 12) + 12) % 12] ?? 'C'}${Math.floor(nearest / 12) - 1}`;
};

export const NOTE_SAMPLES = 960;

// carried: the note sounding at the loop's start began before its end, so it is not struck again there.
export type Note = {
    readonly from: number;
    readonly to: number;
    readonly semitones: number;
    readonly carried: boolean;
};

const GATE = 0.05;

const volumeAt = ({ waves }: Sounding, t: number) =>
    waves.volume === null ? 1 : waveAt(waves.volume, t);

// A note starts where the pitch moves to another semitone, or where the volume rises out of silence: a gate re-strikes a repeated note.
export const notesOf = (sounding: Sounding): readonly Note[] => {
    const heard = Array.from({ length: NOTE_SAMPLES }, (_, index) => ({
        semitones: semitonesAt(sounding, index / NOTE_SAMPLES),
        loud: volumeAt(sounding, index / NOTE_SAMPLES) >= GATE,
    }));
    const starts = heard.flatMap((here, index) => {
        const before = heard[(index + NOTE_SAMPLES - 1) % NOTE_SAMPLES] ?? here;
        const moved = Math.round(here.semitones) !== Math.round(before.semitones);

        return moved || (here.loud && !before.loud) ? [index] : [];
    });
    const first = starts[0];

    if (first === undefined) {
        return [{ from: 0, to: 1, semitones: heard[0]?.semitones ?? 0, carried: false }];
    }

    const struck = starts.map((start, index): Note => ({
        from: start / NOTE_SAMPLES,
        to: (starts[index + 1] ?? NOTE_SAMPLES) / NOTE_SAMPLES,
        semitones: heard[start]?.semitones ?? 0,
        carried: false,
    }));

    return first === 0
        ? struck
        : [
              {
                  from: 0,
                  to: first / NOTE_SAMPLES,
                  semitones: heard[0]?.semitones ?? 0,
                  carried: true,
              },
              ...struck,
          ];
};

// Negative for a carried note: it began in the loop before, at the last note's start.
export const onsetAt = (notes: readonly Note[], t: number) => {
    const at = ((t % 1) + 1) % 1;
    const current = notes.filter(({ from }) => from <= at).at(-1);

    return current === undefined
        ? 0
        : current.carried
          ? (notes.at(-1)?.from ?? 0) - 1
          : current.from;
};

export type Level = {
    readonly frequency: number;
    readonly gain: number;
    readonly cutoff: number;
    readonly pan: number;
};

const OPEN_FILTER = 0.6;
const FILTER_OCTAVES = 6;

const brightnessAt = ({ waves }: Sounding, t: number, open: number) =>
    waves.filter === null ? open : Math.min(1, Math.max(0, waveAt(waves.filter, t)));

const swellAt = ({ waves }: Sounding, t: number) =>
    waves.volume === null ? 1 : Math.min(1, Math.max(0, waveAt(waves.volume, t)));

// What reaches the window's bus: for an instrument only its volume, filter and pan, since each note brings its own envelope.
export const levelAt = (
    sounding: Sounding,
    notes: readonly Note[],
    t: number,
    seconds: number,
): Level => {
    const { voice, waves } = sounding;
    const frequency = frequencyOf(voice.root + semitonesAt(sounding, t));
    const swell = swellAt(sounding, t);
    const pan = waves.pan === null ? 0 : Math.min(1, Math.max(-1, waveAt(waves.pan, t)));

    if (voice.instrument !== 'synth') {
        return {
            frequency,
            gain: voice.volume * swell,
            cutoff: Math.min(18000, 40 * 2 ** (brightnessAt(sounding, t, 1) * 9)),
            pan,
        };
    }

    const since = (t - onsetAt(notes, t)) * seconds;
    const envelope = voice.articulation === 'pluck' ? Math.exp(-since / voice.decay) : 1;

    return {
        frequency,
        gain: voice.volume * swell * envelope,
        cutoff: Math.min(
            18000,
            Math.max(
                40,
                frequency * 2 ** (brightnessAt(sounding, t, OPEN_FILTER) * FILTER_OCTAVES),
            ),
        ),
        pan,
    };
};

const heldAt = (notes: readonly Note[], t: number) => {
    const at = ((t % 1) + 1) % 1;
    const current = notes.filter(({ from }) => from <= at).at(-1);
    const first = notes[0];
    const last = notes.at(-1);

    return current === undefined || last === undefined
        ? 1
        : current.carried
          ? last.to - last.from + current.to
          : current === last && first?.carried === true
            ? last.to - last.from + first.to
            : current.to - current.from;
};

// How loud the voice is as heard, envelope and all: an instrument's own, so a sketch flares as each note sounds.
export const heardAt = (sounding: Sounding, notes: readonly Note[], t: number, seconds: number) => {
    const { voice } = sounding;

    return voice.instrument === 'synth'
        ? levelAt(sounding, notes, t, seconds).gain
        : voice.volume *
              swellAt(sounding, t) *
              envelopeAt(
                  INSTRUMENTS[voice.instrument].amp,
                  (t - onsetAt(notes, t)) * seconds,
                  heldAt(notes, t) * seconds,
              );
};

export const voiceCurve = (sounding: Sounding, seconds: number) => {
    const notes = notesOf(sounding);

    return curveOf(t => heardAt(sounding, notes, t, seconds));
};

export type Heard = { readonly sounding: Sounding; readonly notes: readonly Note[] };

export type Played = {
    readonly level: Level;
    readonly shape: Shape;
    readonly glide: number;
    readonly synth: boolean;
};

export const playedAt = (
    { sounding, notes }: Heard,
    t: number,
    seconds: number,
    playing: boolean,
): Played => {
    const level = levelAt(sounding, notes, t, seconds);

    return {
        level: { ...level, gain: playing ? level.gain : 0 },
        shape: sounding.voice.shape,
        glide: sounding.voice.glide,
        synth: sounding.voice.instrument === 'synth',
    };
};

export type Planned = Strike<Note> & {
    readonly instrument: Instrument;
    readonly frequency: number;
};

export type Planning = { readonly schedule: Schedule; readonly strikes: readonly Planned[] };

export const unplanned: Planning = { schedule: unscheduled, strikes: [] };

export const plannedNotes = (
    { schedule }: Planning,
    { sounding, notes }: Heard,
    frame: Frame,
): Planning => {
    const { instrument, root } = sounding.voice;

    if (instrument === 'synth') {
        return unplanned;
    }

    const next = scheduled(schedule, frame, notes);

    return {
        schedule: next.schedule,
        strikes: next.strikes.map(planned => ({
            ...planned,
            instrument: INSTRUMENTS[instrument],
            frequency: frequencyOf(root + planned.span.semitones),
        })),
    };
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const numberIn = (value: unknown, low: number, high: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(high, Math.max(low, value))
        : fallback;

export const parseVoice = (value: unknown): Voice => {
    if (typeof value !== 'object' || value === null) {
        return defaultVoice;
    }

    const shape = field(value, 'shape');
    const scale = field(value, 'scale');
    const articulation = field(value, 'articulation');
    const sources = field(value, 'sources');
    const source = (param: VoiceParam) => {
        const read = typeof sources === 'object' && sources !== null ? field(sources, param) : null;

        return typeof read === 'string' ? read : null;
    };

    const instrument = field(value, 'instrument');

    return {
        instrument:
            typeof instrument === 'string' && isVoiceInstrument(instrument)
                ? instrument
                : defaultVoice.instrument,
        shape: typeof shape === 'string' && isShape(shape) ? shape : defaultVoice.shape,
        root: Math.round(numberIn(field(value, 'root'), ROOTS.low, ROOTS.high, defaultVoice.root)),
        scale: typeof scale === 'string' && isScale(scale) ? scale : defaultVoice.scale,
        articulation:
            typeof articulation === 'string' && isArticulation(articulation)
                ? articulation
                : defaultVoice.articulation,
        decay: numberIn(field(value, 'decay'), DECAY.low, DECAY.high, defaultVoice.decay),
        glide: numberIn(field(value, 'glide'), GLIDE.low, GLIDE.high, defaultVoice.glide),
        volume: numberIn(field(value, 'volume'), 0, 1, defaultVoice.volume),
        sources: {
            pitch: source('pitch'),
            volume: source('volume'),
            filter: source('filter'),
            pan: source('pan'),
        },
    };
};
