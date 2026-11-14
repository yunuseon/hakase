import { defaultTickets } from './shared/tickets.ts';
import { defaultSignal, type Signal } from './shared/signal.ts';
import { defaultVoice, type Voice } from './components/voice/voice.ts';
import { ACCENT, defaultDrums, NORMAL, PRESETS } from './components/drums/drums.ts';
import { defaultPanel } from './components/sketch/params.ts';
import { unlinkedSketch } from './components/sketch/links.ts';
import { defaultPedal, type Pedal, type PedalKind } from './pedals.ts';
import { GATE_DEFAULTS, GATES, type Bit, type Gate, type GateKind } from './gates.ts';
import { CONVERTER_DEFAULTS, UNSHAPED, type Converter, type Shape } from './converters.ts';
import type { Box } from './boxes.ts';
import { defaultSketch, defaultPlot } from './settings.ts';
import type { Size } from './components/window/frame.ts';
import type { Bindings } from './inputs.ts';
import type { Blueprint, BlueprintWindow, Blueprints } from './blueprints.ts';
import type { ProgramId } from './program.ts';
import type { Settings } from './settings.ts';
import type { StoreEntry, StoreId } from './stores.ts';

export type Starter = Blueprint & { readonly summary: string };

const held = {
    tickets: [],
    notes: [],
    agendas: [],
    habits: [],
    clocks: [],
    bookmarks: [],
    signals: [],
    paintings: [],
    pens: [],
    voices: [],
    drums: [],
    pedals: [],
    gates: [],
    converters: [],
    boxes: [],
    sketchLinks: [],
} satisfies Blueprint['held'];

const opened = (
    id: string,
    program: ProgramId,
    store: StoreId,
    { x, y, width, height }: { readonly x: number; readonly y: number } & Size,
    follows: Bindings = {},
    settings: Settings | null = null,
): BlueprintWindow => ({
    id,
    program,
    store,
    follows,
    frame: { x, y, z: 0, width, height },
    measured: { width, height },
    settings,
});

const envelope = (sound: StoreId): Converter => ({
    ...CONVERTER_DEFAULTS['sound-level'],
    sources: { in: sound, time: null },
});

const own = (id: StoreId, program: ProgramId, name: string): StoreEntry => ({
    id,
    program,
    name,
    kept: true,
    copy: null,
    clock: null,
});

// Pitch is octaves above the voice's root and a steps signal swings offset ± depth, so a table spanning low..high semitones is this.
const tune = (
    semitones: readonly number[],
    rate: Signal['rate'],
    rest: Partial<Signal> = {},
): Signal => {
    const low = Math.min(...semitones);
    const high = Math.max(...semitones);

    return {
        ...defaultSignal,
        shape: 'steps',
        rate,
        offset: (low + high) / 24,
        depth: (high - low) / 24,
        steps: semitones.map(note => (note - low) / (high - low)),
        ...rest,
    };
};

const hits = (marks: string) =>
    [...marks].map(mark => (mark === 'X' ? ACCENT : mark === 'x' ? NORMAL : 0));

const voice = (rest: Partial<Voice>): Voice => ({ ...defaultVoice, scale: 'major', ...rest });

const sources = (rest: Partial<Voice['sources']>): Voice['sources'] => ({
    ...defaultVoice.sources,
    ...rest,
});

const GROUND = [0, -5, -3, -8, -7, -12, -7, -5];

const LINE = [4, 2, 0, -1, -3, -5, -3, -1, 0, -1, -3, -5, -7, -8, -7, -10];

const SONG = { playback: { kind: 'playback', store: 'song' } } as const;

const LOOP = { playback: { kind: 'playback', store: 'loop' } } as const;

const TICK = { playback: { kind: 'playback', store: 'tick' } } as const;

const SHOW = { playback: { kind: 'playback', store: 'show' } } as const;

const ORGAN = { playback: { kind: 'playback', store: 'organ' } } as const;

const reading = (picture: StoreId, choice: string, shape: Partial<Shape>): Converter => ({
    ...CONVERTER_DEFAULTS['picture-level'],
    choice,
    shape: { ...UNSHAPED, ...shape },
    sources: { in: picture, time: null },
});

const bits = (marks: string): readonly Bit[] => [...marks].map(mark => (mark === '1' ? 1 : 0));

const pedal = (
    kind: PedalKind,
    values: Readonly<Record<string, number>>,
    sources: Readonly<Record<string, string>>,
    choice?: string,
): Pedal => ({
    ...defaultPedal(kind),
    values: { ...defaultPedal(kind).values, ...values },
    sources: { ...defaultPedal(kind).sources, ...sources },
    choice: choice ?? defaultPedal(kind).choice,
});

const gate = (kind: GateKind, sources: Gate['sources'] = {}, rest: Partial<Gate> = {}): Gate => ({
    ...GATE_DEFAULTS[kind],
    sources: { ...GATE_DEFAULTS[kind].sources, ...sources },
    ...rest,
});

const inner = (id: string, program: GateKind, x: number, y: number) => {
    const { settings: _, ...draft } = opened(
        id,
        program,
        id,
        { x, y, ...GATES[program].size },
        TICK,
    );

    return draft;
};

const A: readonly Bit[] = [0, 1, 0, 1, 0, 1, 0, 1];
const B: readonly Bit[] = [0, 0, 1, 1, 0, 0, 1, 1];

const ADDER: Box = {
    name: 'half adder',
    inner: [
        inner('pa', 'pin-in', 0, 0),
        inner('pb', 'pin-in', 0, 120),
        inner('n1', 'nand', 224, 60),
        inner('n2', 'nand', 424, 0),
        inner('n3', 'nand', 424, 120),
        inner('n4', 'nand', 624, 0),
        inner('n5', 'nand', 624, 120),
        inner('sum', 'pin-out', 824, 0),
        inner('carry', 'pin-out', 824, 120),
    ],
    inputs: ['pa', 'pb'],
    outputs: ['sum', 'carry'],
    sources: Object.fromEntries(
        ['pa', 'pb', 'n1', 'n2', 'n3', 'n4', 'n5', 'sum', 'carry'].map(id => [id, id]),
    ),
};

const REVIEW = `Daily review

Went well
-

Did not go to plan
-

Tomorrow's top three
1.
2.
3.
`;

// A window on a store the blueprint does not list keeps that id when placed, so these work on the main tickets, agenda, habits and timer.
export const STARTERS: readonly Starter[] = [
    {
        id: 'starter-today',
        name: 'Today',
        summary: 'Your agenda, where you are in it, and how far through your to-dos you are.',
        size: { width: 684, height: 592 },
        windows: [
            opened('agenda', 'agenda', 'agenda', { x: 24, y: 48, width: 320, height: 520 }),
            opened(
                'progress',
                'progress',
                'progress',
                { x: 360, y: 48, width: 300, height: 130 },
                { source: { kind: 'agenda', store: 'agenda' } },
            ),
            opened(
                'todo',
                'tickets',
                'tickets',
                { x: 360, y: 194, width: 300, height: 228 },
                {},
                { kind: 'tickets', view: 'list' },
            ),
            opened(
                'done',
                'progress',
                'progress',
                { x: 360, y: 438, width: 300, height: 130 },
                { source: { kind: 'tickets', store: 'tickets' } },
            ),
        ],
        stores: [],
        held,
        formulas: [],
        links: [],
    },
    {
        id: 'starter-focus-session',
        name: 'Focus session',
        summary:
            'A fresh ticket board for the work, the focus timer, and how far the phase has run.',
        size: { width: 1044, height: 558 },
        windows: [
            opened(
                'board',
                'tickets',
                'session',
                { x: 24, y: 48, width: 720, height: 486 },
                {},
                { kind: 'tickets', view: 'board' },
            ),
            opened('focus', 'focus', 'focus', { x: 760, y: 48, width: 260, height: 340 }),
            opened(
                'progress',
                'progress',
                'progress',
                { x: 760, y: 404, width: 260, height: 130 },
                { source: { kind: 'focus', store: 'focus' } },
            ),
        ],
        stores: [own('session', 'tickets', 'Focus session')],
        held: { ...held, tickets: [['session', defaultTickets]] },
        formulas: [],
        links: [],
    },
    {
        id: 'starter-daily-review',
        name: 'Daily review',
        summary: 'A fresh review note for tonight, your habits, and what to carry over.',
        size: { width: 864, height: 512 },
        windows: [
            opened(
                'note',
                'note',
                'review',
                { x: 24, y: 48, width: 340, height: 440 },
                {},
                { kind: 'note', note: 'note-1' },
            ),
            opened('habits', 'habits', 'habits', { x: 380, y: 48, width: 460, height: 220 }),
            opened(
                'todo',
                'tickets',
                'tickets',
                { x: 380, y: 284, width: 460, height: 204 },
                {},
                { kind: 'tickets', view: 'list' },
            ),
        ],
        stores: [own('review', 'note', 'Daily review')],
        held: {
            ...held,
            notes: [['review', { items: [{ id: 'note-1', text: REVIEW }], made: 1 }]],
        },
        formulas: [],
        links: [],
    },
    {
        id: 'starter-canon',
        name: 'Canon in D',
        summary:
            "Pachelbel's Canon on a loop: the ground bass, a harp arpeggio that follows it, two violins a turn apart, drums, and a sketch that plays along. Press play, then Listen on each instrument.",
        size: { width: 1832, height: 1360 },
        windows: [
            opened('timeline', 'timeline', 'song', { x: 24, y: 48, width: 520, height: 120 }),
            opened('sketch', 'sketch', 'canon', { x: 24, y: 184, width: 520, height: 776 }, SONG, {
                ...defaultSketch,
                formula: 'canon',
                theme: 'ember',
                panel: { ...defaultPanel, dimension: 72, baseSize: 5, trails: 0.25 },
            }),
            opened('bass', 'voice', 'bass', { x: 560, y: 48, width: 300, height: 320 }, SONG),
            opened('harp', 'voice', 'harp', { x: 876, y: 48, width: 300, height: 320 }, SONG),
            opened(
                'violin-1',
                'voice',
                'violin-1',
                { x: 1192, y: 48, width: 300, height: 320 },
                SONG,
            ),
            opened(
                'violin-2',
                'voice',
                'violin-2',
                { x: 1508, y: 48, width: 300, height: 320 },
                SONG,
            ),
            opened('ground', 'signal', 'ground', { x: 560, y: 384, width: 300, height: 260 }, SONG),
            opened('arp', 'signal', 'arp', { x: 876, y: 384, width: 300, height: 260 }, SONG),
            opened(
                'line-1',
                'signal',
                'line-1',
                { x: 1192, y: 384, width: 300, height: 260 },
                SONG,
            ),
            opened(
                'line-2',
                'signal',
                'line-2',
                { x: 1508, y: 384, width: 300, height: 260 },
                SONG,
            ),
            opened('beat', 'drums', 'beat', { x: 560, y: 660, width: 440, height: 300 }, SONG),
            opened(
                'bass-level',
                'sound-level',
                'bass-level',
                { x: 24, y: 976, width: 300, height: 360 },
                SONG,
            ),
            opened(
                'harp-level',
                'sound-level',
                'harp-level',
                { x: 340, y: 976, width: 300, height: 360 },
                SONG,
            ),
            opened(
                'beat-level',
                'sound-level',
                'beat-level',
                { x: 656, y: 976, width: 300, height: 360 },
                SONG,
            ),
            opened('sway', 'signal', 'sway', { x: 1016, y: 660, width: 220, height: 300 }, SONG),
            opened(
                'plot',
                'plot',
                'plot',
                { x: 1252, y: 660, width: 556, height: 300 },
                {
                    ...SONG,
                    a: { kind: 'signal', store: 'ground' },
                    b: { kind: 'signal', store: 'arp' },
                    c: { kind: 'signal', store: 'line-1' },
                    d: { kind: 'signal', store: 'line-2' },
                },
                { ...defaultPlot, layout: 'lanes' },
            ),
        ],
        stores: [
            { ...own('song', 'timeline', 'Canon'), clock: { duration: 12, looping: true } },
            own('canon', 'sketch', 'Canon'),
            own('bass', 'voice', 'Bass'),
            own('harp', 'voice', 'Harp'),
            own('violin-1', 'voice', 'Violin I'),
            own('violin-2', 'voice', 'Violin II'),
            own('ground', 'signal', 'Ground'),
            own('arp', 'signal', 'Arpeggio'),
            own('line-1', 'signal', 'Violin I line'),
            own('line-2', 'signal', 'Violin II line'),
            own('sway', 'signal', 'Sway'),
            own('beat', 'drums', 'Beat'),
            own('bass-level', 'sound-level', 'Bass level'),
            own('harp-level', 'sound-level', 'Harp level'),
            own('beat-level', 'sound-level', 'Beat level'),
        ],
        held: {
            ...held,
            sketchLinks: [
                [
                    'canon',
                    {
                        sources: {
                            ...unlinkedSketch.sources,
                            k1: 'bass-level',
                            k2: 'harp-level',
                            k3: 'line-1',
                            k4: 'beat-level',
                        },
                    },
                ],
            ],
            converters: [
                ['bass-level', envelope('bass')],
                ['harp-level', envelope('harp')],
                ['beat-level', envelope('beat')],
            ],
            signals: [
                ['ground', tune(GROUND, 2)],
                [
                    'arp',
                    // The ground replaces offset, so depth must stay 1 for a step of (n + 12) / 24 to sit n semitones above it.
                    {
                        ...defaultSignal,
                        shape: 'steps',
                        rate: 16,
                        offset: 0,
                        depth: 1,
                        steps: [0, 7, 12, 7].map(note => (note + 12) / 24),
                        sources: { ...defaultSignal.sources, offset: 'ground' },
                    },
                ],
                ['line-1', tune(LINE, 1)],
                ['line-2', tune(LINE, 1, { phase: 0.5 })],
                ['sway', { ...defaultSignal, shape: 'sine', rate: 1, offset: 0, depth: 0.6 }],
            ],
            voices: [
                [
                    'bass',
                    voice({
                        instrument: 'bass',
                        root: 50,
                        volume: 0.7,
                        sources: sources({ pitch: 'ground' }),
                    }),
                ],
                [
                    'harp',
                    voice({
                        instrument: 'harp',
                        root: 62,
                        volume: 0.45,
                        sources: sources({ pitch: 'arp', pan: 'sway' }),
                    }),
                ],
                [
                    'violin-1',
                    voice({
                        instrument: 'flute',
                        root: 74,
                        volume: 0.5,
                        sources: sources({ pitch: 'line-1' }),
                    }),
                ],
                [
                    'violin-2',
                    voice({
                        instrument: 'pad',
                        root: 62,
                        volume: 0.4,
                        sources: sources({ pitch: 'line-2' }),
                    }),
                ],
            ],
            drums: [
                [
                    'beat',
                    {
                        ...defaultDrums,
                        repeat: 4,
                        volume: 0.5,
                        pattern: {
                            ...PRESETS.backbeat,
                            open: hits('..............x.'),
                        },
                    },
                ],
            ],
        },
        formulas: [],
        links: [],
    },
    {
        id: 'starter-pedalboard',
        name: 'Pedalboard',
        summary:
            'A sketch run through pedals like a guitar through effects: a kaleidoscope a signal turns, a colour map, and an output to export. Rewire any stage in state mode.',
        size: { width: 1464, height: 856 },
        windows: [
            opened('loop', 'timeline', 'loop', { x: 24, y: 48, width: 360, height: 120 }),
            opened('source', 'sketch', 'source', { x: 24, y: 168, width: 360, height: 452 }, LOOP, {
                ...defaultSketch,
                formula: 'ripple',
                theme: 'dusk',
                panel: { ...defaultPanel, dimension: 48 },
            }),
            opened('fold', 'kaleido', 'fold', { x: 384, y: 168, width: 300, height: 452 }, LOOP),
            opened('tint', 'colourmap', 'tint', { x: 684, y: 168, width: 300, height: 452 }, LOOP),
            opened(
                'out',
                'output',
                'output',
                { x: 984, y: 168, width: 480, height: 620 },
                { ...LOOP, in: { kind: 'colourmap', store: 'tint' } },
            ),
            opened('spin', 'signal', 'spin', { x: 24, y: 620, width: 360, height: 236 }, LOOP),
        ],
        stores: [
            { ...own('loop', 'timeline', 'Pedalboard'), clock: { duration: 8, looping: true } },
            own('source', 'sketch', 'Source'),
            own('fold', 'kaleido', 'Fold'),
            own('tint', 'colourmap', 'Tint'),
            own('spin', 'signal', 'Spin'),
        ],
        held: {
            ...held,
            signals: [
                ['spin', { ...defaultSignal, shape: 'saw', rate: 1, offset: 0.5, depth: 0.5 }],
            ],
            pedals: [
                [
                    'fold',
                    {
                        ...defaultPedal('kaleido'),
                        values: { ...defaultPedal('kaleido').values, segments: 8 },
                        sources: {
                            ...defaultPedal('kaleido').sources,
                            in: 'source',
                            rotate: 'spin',
                        },
                    },
                ],
                [
                    'tint',
                    {
                        ...defaultPedal('colourmap'),
                        choice: 'ember',
                        sources: { ...defaultPedal('colourmap').sources, in: 'fold' },
                    },
                ],
            ],
        },
        formulas: [],
        links: [
            { a: 'loop', b: 'source' },
            { a: 'source', b: 'fold' },
            { a: 'fold', b: 'tint' },
            { a: 'tint', b: 'out' },
            { a: 'source', b: 'spin' },
        ],
    },
    {
        id: 'starter-light-show',
        name: 'Light show',
        summary:
            'Two sketches through six pedals into one picture: a turning knot folded by a kaleidoscope and echoed by feedback, a vortex softened in time with a kick drum, screened together, colour graded and strobed by a gate. Four signals and a plot show what moves what. Press play.',
        size: { width: 2168, height: 1244 },
        windows: [
            opened('show', 'timeline', 'show', { x: 24, y: 48, width: 360, height: 120 }),
            opened('spin', 'signal', 'spin', { x: 400, y: 48, width: 280, height: 236 }, SHOW),
            opened('drift', 'signal', 'drift', { x: 696, y: 48, width: 280, height: 236 }, SHOW),
            opened('swell', 'signal', 'swell', { x: 992, y: 48, width: 280, height: 236 }, SHOW),
            opened('cycle', 'signal', 'cycle', { x: 1288, y: 48, width: 280, height: 236 }, SHOW),
            opened(
                'plot',
                'plot',
                'plot',
                { x: 1584, y: 48, width: 560, height: 236 },
                {
                    ...SHOW,
                    a: { kind: 'signal', store: 'spin' },
                    b: { kind: 'signal', store: 'drift' },
                    c: { kind: 'signal', store: 'swell' },
                    d: { kind: 'signal', store: 'cycle' },
                },
                { ...defaultPlot, layout: 'lanes' },
            ),
            opened('knot', 'sketch', 'knot', { x: 24, y: 300, width: 360, height: 452 }, SHOW, {
                ...defaultSketch,
                formula: 'trefoil',
                theme: 'ice',
                panel: { ...defaultPanel, mode: 'lines', dimension: 64 },
            }),
            opened('fold', 'kaleido', 'fold', { x: 400, y: 300, width: 300, height: 452 }, SHOW),
            opened('echo', 'feedback', 'echo', { x: 716, y: 300, width: 300, height: 452 }, SHOW),
            opened('blend', 'mix', 'blend', { x: 1032, y: 300, width: 300, height: 452 }, SHOW),
            opened(
                'grade',
                'colourmap',
                'grade',
                { x: 1348, y: 300, width: 300, height: 452 },
                SHOW,
            ),
            opened(
                'out',
                'output',
                'output',
                { x: 1664, y: 300, width: 480, height: 620 },
                { ...SHOW, in: { kind: 'colourmap', store: 'grade' } },
            ),
            opened('swirl', 'sketch', 'swirl', { x: 24, y: 768, width: 360, height: 452 }, SHOW, {
                ...defaultSketch,
                formula: 'vortex',
                theme: 'dusk',
                panel: { ...defaultPanel, dimension: 72, trails: 0.4 },
            }),
            opened('haze', 'blur', 'haze', { x: 400, y: 768, width: 300, height: 452 }, SHOW),
            opened('pulse', 'drums', 'pulse', { x: 716, y: 768, width: 440, height: 300 }, SHOW),
            opened('strobe', 'pattern', 'strobe', { x: 1172, y: 768, ...GATES.pattern.size }, SHOW),
            opened(
                'kick',
                'sound-level',
                'kick',
                { x: 1172, y: 848, width: 320, height: 360 },
                SHOW,
            ),
        ],
        stores: [
            {
                ...own('show', 'timeline', 'Light show'),
                clock: { duration: 16, looping: true, ticks: 16 },
            },
            own('spin', 'signal', 'Spin'),
            own('drift', 'signal', 'Drift'),
            own('swell', 'signal', 'Swell'),
            own('cycle', 'signal', 'Cycle'),
            own('knot', 'sketch', 'Knot'),
            own('swirl', 'sketch', 'Swirl'),
            own('fold', 'kaleido', 'Fold'),
            own('echo', 'feedback', 'Echo'),
            own('haze', 'blur', 'Haze'),
            own('blend', 'mix', 'Blend'),
            own('grade', 'colourmap', 'Grade'),
            own('pulse', 'drums', 'Pulse'),
            own('strobe', 'pattern', 'Strobe'),
            own('kick', 'sound-level', 'Kick'),
        ],
        held: {
            ...held,
            signals: [
                ['spin', { ...defaultSignal, shape: 'saw', rate: 1, offset: 0.5, depth: 0.5 }],
                ['drift', { ...defaultSignal, shape: 'sine', rate: 2, offset: 0, depth: 0.02 }],
                ['swell', { ...defaultSignal, shape: 'sine', rate: 1, offset: 0.6, depth: 0.35 }],
                ['cycle', { ...defaultSignal, shape: 'saw', rate: 1, offset: 0, depth: 1 }],
            ],
            sketchLinks: [
                ['knot', { sources: { ...unlinkedSketch.sources, turn: 'spin' } }],
                ['swirl', { sources: { ...unlinkedSketch.sources, k1: 'swell', k4: 'cycle' } }],
            ],
            drums: [
                ['pulse', { ...defaultDrums, volume: 0.6, pattern: PRESETS['four on the floor'] }],
            ],
            gates: [['strobe', gate('pattern', {}, { steps: bits('1111111111110101') })]],
            converters: [['kick', envelope('pulse')]],
            pedals: [
                ['fold', pedal('kaleido', { segments: 8 }, { in: 'knot', rotate: 'spin' })],
                [
                    'echo',
                    pedal('feedback', { decay: 0.9, zoom: 1.025 }, { in: 'fold', rotate: 'drift' }),
                ],
                ['haze', pedal('blur', {}, { in: 'swirl', radius: 'kick' })],
                ['blend', pedal('mix', {}, { a: 'echo', b: 'haze', amount: 'swell' }, 'screen')],
                [
                    'grade',
                    pedal(
                        'colourmap',
                        {},
                        { in: 'blend', offset: 'cycle', amount: 'strobe' },
                        'ember',
                    ),
                ],
            ],
        },
        formulas: [],
        links: [],
    },
    {
        id: 'starter-light-organ',
        name: 'Light organ',
        summary:
            'A sketch played as an organ: its brightness picks the note and its motion swells the sound, both read off the picture by two converters, while a signal that follows the motion wobbles the tone and a pattern gate cuts the kick in and out. Press play, then Listen on the organ and the drums.',
        size: { width: 1592, height: 1100 },
        windows: [
            opened('organ', 'timeline', 'organ', { x: 24, y: 48, width: 360, height: 120 }),
            opened('breath', 'signal', 'breath', { x: 400, y: 48, width: 300, height: 236 }, ORGAN),
            opened(
                'shimmer',
                'signal',
                'shimmer',
                { x: 716, y: 48, width: 300, height: 236 },
                ORGAN,
            ),
            opened(
                'scope',
                'plot',
                'scope',
                { x: 1032, y: 48, width: 536, height: 236 },
                {
                    ...ORGAN,
                    a: { kind: 'picture-level', store: 'glow' },
                    b: { kind: 'picture-level', store: 'stir' },
                    c: { kind: 'signal', store: 'shimmer' },
                    d: { kind: 'pattern', store: 'cut' },
                },
                { ...defaultPlot, layout: 'lanes' },
            ),
            opened(
                'lights',
                'sketch',
                'lights',
                { x: 24, y: 300, width: 360, height: 452 },
                ORGAN,
                {
                    ...defaultSketch,
                    formula: 'ripple',
                    theme: 'ember',
                    panel: { ...defaultPanel, mode: 'surface', dimension: 72 },
                },
            ),
            opened(
                'glow',
                'picture-level',
                'glow',
                { x: 400, y: 300, width: 300, height: 340 },
                ORGAN,
            ),
            opened(
                'stir',
                'picture-level',
                'stir',
                { x: 716, y: 300, width: 300, height: 340 },
                ORGAN,
            ),
            opened('pipes', 'voice', 'pipes', { x: 1032, y: 300, width: 400, height: 360 }, ORGAN),
            opened('beat', 'drums', 'beat', { x: 400, y: 656, width: 560, height: 400 }, ORGAN),
            opened('cut', 'pattern', 'cut', { x: 976, y: 676, ...GATES.pattern.size }, ORGAN),
        ],
        stores: [
            {
                ...own('organ', 'timeline', 'Light organ'),
                clock: { duration: 8, looping: true, ticks: 16 },
            },
            own('breath', 'signal', 'Breath'),
            own('shimmer', 'signal', 'Shimmer'),
            own('lights', 'sketch', 'Lights'),
            own('glow', 'picture-level', 'Glow'),
            own('stir', 'picture-level', 'Stir'),
            own('pipes', 'voice', 'Pipes'),
            own('beat', 'drums', 'Beat'),
            own('cut', 'pattern', 'Cut'),
        ],
        held: {
            ...held,
            signals: [
                ['breath', { ...defaultSignal, shape: 'sine', rate: 1, offset: 7, depth: 5 }],
                [
                    'shimmer',
                    {
                        ...defaultSignal,
                        shape: 'sine',
                        rate: 8,
                        offset: 0.55,
                        depth: 0.1,
                        sources: { ...defaultSignal.sources, depth: 'stir' },
                    },
                ],
            ],
            sketchLinks: [
                ['lights', { sources: { ...unlinkedSketch.sources, distance: 'breath' } }],
            ],
            converters: [
                ['glow', reading('lights', 'brightness', { low: -2, high: 10 })],
                ['stir', reading('lights', 'motion', { low: 0, high: 15, smooth: 0.3 })],
            ],
            voices: [
                [
                    'pipes',
                    voice({
                        instrument: 'organ',
                        scale: 'pentatonic',
                        root: 48,
                        volume: 0.6,
                        sources: sources({ pitch: 'glow', volume: 'stir', filter: 'shimmer' }),
                    }),
                ],
            ],
            drums: [
                [
                    'beat',
                    {
                        ...defaultDrums,
                        volume: 0.5,
                        pattern: PRESETS['four on the floor'],
                        sources: { ...defaultDrums.sources, volume: 'cut' },
                    },
                ],
            ],
            gates: [['cut', gate('pattern', {}, { steps: bits('1111000011110011') })]],
        },
        formulas: [],
        links: [],
    },
    {
        id: 'starter-logic',
        name: 'Logic primer',
        summary:
            'Two patterns into a half adder built from NAND gates and boxed into a component, and a one-gate counter that flips every tick through a delay. Open the component to see its gates.',
        size: { width: 720, height: 520 },
        windows: [
            opened('tick', 'timeline', 'tick', { x: 24, y: 48, width: 360, height: 120 }),
            opened('a', 'pattern', 'a', { x: 24, y: 184, ...GATES.pattern.size }, TICK),
            opened('b', 'pattern', 'b', { x: 24, y: 280, ...GATES.pattern.size }, TICK),
            opened('adder', 'box', 'adder', { x: 256, y: 184, width: 240, height: 224 }, TICK),
            opened('lsum', 'lamp', 'lsum', { x: 512, y: 184, ...GATES.lamp.size }, TICK),
            opened('lcarry', 'lamp', 'lcarry', { x: 512, y: 280, ...GATES.lamp.size }, TICK),
            opened('q', 'delay', 'q', { x: 24, y: 440, ...GATES.delay.size }, TICK),
            opened('nq', 'nand', 'nq', { x: 224, y: 440, ...GATES.nand.size }, TICK),
        ],
        stores: [
            {
                ...own('tick', 'timeline', 'Logic'),
                clock: { duration: 4, looping: true, ticks: 8 },
            },
            own('a', 'pattern', 'a'),
            own('b', 'pattern', 'b'),
            own('adder', 'box', 'half adder'),
            own('pa', 'pin-in', 'half adder.a'),
            own('pb', 'pin-in', 'half adder.b'),
            own('n1', 'nand', 'a nand b'),
            own('n2', 'nand', 'n2'),
            own('n3', 'nand', 'n3'),
            own('n4', 'nand', 'a xor b'),
            own('n5', 'nand', 'a and b'),
            own('sum', 'pin-out', 'half adder.sum'),
            own('carry', 'pin-out', 'half adder.carry'),
            own('lsum', 'lamp', 'sum'),
            own('lcarry', 'lamp', 'carry'),
            own('q', 'delay', 'count'),
            own('nq', 'nand', 'not count'),
        ],
        held: {
            ...held,
            gates: [
                ['a', gate('pattern', {}, { steps: A })],
                ['b', gate('pattern', {}, { steps: B })],
                ['pa', gate('pin-in', { in: 'a' }, { name: 'a' })],
                ['pb', gate('pin-in', { in: 'b' }, { name: 'b' })],
                ['n1', gate('nand', { a: 'pa', b: 'pb' })],
                ['n2', gate('nand', { a: 'pa', b: 'n1' })],
                ['n3', gate('nand', { a: 'pb', b: 'n1' })],
                ['n4', gate('nand', { a: 'n2', b: 'n3' })],
                ['n5', gate('nand', { a: 'n1', b: 'n1' })],
                ['sum', gate('pin-out', { in: 'n4' }, { name: 'sum' })],
                ['carry', gate('pin-out', { in: 'n5' }, { name: 'carry' })],
                ['lsum', gate('lamp', { in: 'sum' })],
                ['lcarry', gate('lamp', { in: 'carry' })],
                ['q', gate('delay', { in: 'nq' })],
                ['nq', gate('nand', { a: 'q', b: 'q' })],
            ],
            boxes: [['adder', ADDER]],
        },
        formulas: [],
        links: [],
    },
];

export const blueprintIn = (blueprints: Blueprints, id: string): Blueprint | undefined =>
    STARTERS.find(starter => starter.id === id) ??
    blueprints.items.find(blueprint => blueprint.id === id);
