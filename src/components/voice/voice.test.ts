import { driverAt } from '../../shared/curve.ts';
import { describe, expect, it } from 'vitest';
import { defaultSignal, type Signal } from '../../shared/signal.ts';
import {
    defaultVoice,
    frequencyOf,
    levelAt,
    noteName,
    notesOf,
    onsetAt,
    parseVoice,
    reduceVoice,
    semitonesOf,
    pitchCurve,
    semitonesAt,
    soundingOf,
    voiceCurve,
    type Voice,
} from './voice.ts';

const melody: Signal = {
    ...defaultSignal,
    shape: 'steps',
    rate: 1,
    offset: 0.5,
    depth: 0.5,
    steps: [0, 0.34, 0.6, 1],
    glide: 0,
};
const signals = new Map([['melody', melody]]);
const playing = (voice: Partial<Voice> = {}) =>
    soundingOf(
        {
            ...defaultVoice,
            ...voice,
            sources: { pitch: 'melody', volume: null, filter: null, pan: null },
        },
        signals,
    );

describe('a voice', () => {
    it('reads its pitch in octaves above the root, snapped to the scale', () => {
        expect(semitonesOf(0.34, 'pentatonic')).toBe(4);
        expect(semitonesOf(0.6, 'major')).toBe(7);
        expect(semitonesOf(0.6, 'free')).toBeCloseTo(7.2);
        expect(semitonesOf(1.1, 'pentatonic')).toBe(14);
        expect(semitonesOf(-0.1, 'minor')).toBe(-2);
        expect(frequencyOf(69)).toBe(440);
        expect(noteName(48)).toBe('C3');
        expect(noteName(61)).toBe('C♯4');
    });

    it('hears a steps signal as notes, each held until the pitch moves', () => {
        const notes = notesOf(playing());

        expect(notes.map(({ semitones }) => semitones)).toEqual([0, 4, 7, 12]);
        expect(notes.map(({ from }) => from)).toEqual([0, 0.25, 0.5, 0.75]);
        expect(notes.at(-1)?.to).toBe(1);
    });

    it('carries a note held across the loop into the next loop rather than striking it again', () => {
        const turn: Signal = { ...melody, steps: [0, 0.34, 0, 0] };
        const notes = notesOf(
            soundingOf(
                {
                    ...defaultVoice,
                    sources: { pitch: 'turn', volume: null, filter: null, pan: null },
                },
                new Map([['turn', turn]]),
            ),
        );

        expect(notesOf(soundingOf(defaultVoice, new Map()))).toHaveLength(1);
        expect(notes.map(({ carried }) => carried)).toEqual([true, false, false]);
        expect(onsetAt(notes, 0.1)).toBeCloseTo(-0.5);
        expect(onsetAt(notes, 0.3)).toBe(0.25);
    });

    it('strikes a repeated note again where a gate on its volume rises out of silence', () => {
        const repeated: Signal = { ...melody, steps: [0, 0, 0.6, 0.6] };
        const gate: Signal = { ...melody, rate: 4, steps: [1, 1, 0, 0] };
        const gated = soundingOf(
            {
                ...defaultVoice,
                sources: { pitch: 'repeated', volume: 'gate', filter: null, pan: null },
            },
            new Map([
                ['repeated', repeated],
                ['gate', gate],
            ]),
        );

        expect(notesOf(gated).map(({ from, semitones }) => [from, semitones])).toEqual([
            [0, 0],
            [0.25, 0],
            [0.5, 7],
            [0.75, 7],
        ]);
    });

    it('strikes each note and lets it fade by its decay, or holds it as a drone', () => {
        const sounding = playing({ decay: 0.5 });
        const notes = notesOf(sounding);
        const struck = levelAt(sounding, notes, 0.25, 8);
        const later = levelAt(sounding, notes, 0.25 + 0.5 / 8, 8);
        const drone = levelAt(playing({ articulation: 'drone' }), notes, 0.4, 8);

        expect(struck.gain).toBeCloseTo(defaultVoice.volume);
        expect(later.gain).toBeCloseTo(defaultVoice.volume * Math.exp(-1));
        expect(drone.gain).toBeCloseTo(defaultVoice.volume);
        expect(struck.frequency).toBeCloseTo(frequencyOf(defaultVoice.root + 4));
        expect(struck.cutoff).toBeGreaterThan(struck.frequency);
        expect(struck.pan).toBe(0);
    });

    it('offers a sketch its level over the loop, peaking where each note is struck', () => {
        const curve = voiceCurve(playing({ decay: 0.2 }), 8);
        const at = (t: number) => curve.samples[Math.round(t * curve.samples.length)] ?? 0;

        expect(at(0.25)).toBeCloseTo(defaultVoice.volume);
        expect(at(0.24)).toBeLessThan(0.1);
        expect(at(0.3)).toBeLessThan(at(0.25));
    });

    it('offers a sketch the envelope of the instrument, not of the synth', () => {
        const bell = playing({ instrument: 'bell' });
        const curve = voiceCurve(bell, 8);
        const at = (t: number) => curve.samples[Math.round(t * curve.samples.length)] ?? 0;

        expect(at(0.25)).toBeLessThan(0.05);
        expect(at(0.26)).toBeGreaterThan(at(0.3));
        expect(at(0.3)).toBeGreaterThan(0.3);
        expect(parseVoice({ instrument: 'harp' }).instrument).toBe('harp');
        expect(parseVoice({ instrument: 'kazoo' }).instrument).toBe('synth');
    });

    it('keeps its settings in range, and reads a broken save as the default, field by field', () => {
        expect(reduceVoice(defaultVoice, { kind: 'root', root: 200 }).root).toBe(84);
        expect(reduceVoice(defaultVoice, { kind: 'volume', volume: Number.NaN })).toBe(
            defaultVoice,
        );
        expect(reduceVoice(defaultVoice, { kind: 'scale', scale: 'pentatonic' })).toBe(
            defaultVoice,
        );
        expect(
            parseVoice({
                shape: 'sawtooth',
                root: 'low',
                decay: 9,
                sources: { pitch: 'a', pan: 2 },
            }),
        ).toEqual({
            ...defaultVoice,
            shape: 'sawtooth',
            decay: 2,
            sources: { pitch: 'a', volume: null, filter: null, pan: null },
        });
    });
});

describe('an Envelope reading a voice', () => {
    it('reads the note the voice is on, in octaves above its root', () => {
        const sounding = playing();
        const curve = pitchCurve(sounding);

        [0.1, 0.3, 0.6, 0.9].forEach(t => {
            expect(driverAt(curve, t)).toBeCloseTo(semitonesAt(sounding, t) / 12, 5);
        });
    });
});
