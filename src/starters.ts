import { defaultTickets } from './shared/tickets.ts';
import { defaultSignal, type Signal } from './shared/signal.ts';
import { defaultVoice, type Voice } from './components/voice/voice.ts';
import { ACCENT, defaultDrums, NORMAL, PRESETS } from './components/drums/drums.ts';
import { defaultPanel } from './components/sketch/params.ts';
import { unlinkedSketch } from './components/sketch/links.ts';
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
        size: { width: 1832, height: 984 },
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
        ],
        held: {
            ...held,
            sketchLinks: [
                [
                    'canon',
                    {
                        sources: {
                            ...unlinkedSketch.sources,
                            k1: 'bass',
                            k2: 'harp',
                            k3: 'line-1',
                            k4: 'beat',
                        },
                    },
                ],
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
];

export const blueprintIn = (blueprints: Blueprints, id: string): Blueprint | undefined =>
    STARTERS.find(starter => starter.id === id) ??
    blueprints.items.find(blueprint => blueprint.id === id);
