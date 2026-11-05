import { describe, expect, it } from 'vitest';
import { defaultVoice } from './components/voice/voice.ts';
import { documentsKit, reduceHistory, seqFloor, type Documents } from './documents.ts';
import { inputsFor } from './inputs.fixture.ts';
import { emptyLibrary } from './library.ts';
import { emptyPieces, parsePieces, pieceOf, placed, type Piece } from './pieces.ts';
import { defaultSketch } from './settings.ts';
import { defaultSignal } from './shared/signal.ts';
import { startTimeline } from './timeline.ts';
import { defaultWorkspace, type Process } from './workspace.ts';

const frame = (x: number, y: number) => ({ x, y, z: 0, width: 300, height: 300 });
const measured = { width: 300, height: 300 };
const clock = { playback: { kind: 'playback', store: 'timeline' } } as const;

const windows: readonly Process[] = [
    {
        id: 'signal-1',
        program: 'signal',
        store: 'store-a',
        follows: clock,
        frame: frame(100, 100),
        measured,
    },
    {
        id: 'voice-1',
        program: 'voice',
        store: 'voice',
        follows: clock,
        frame: frame(420, 100),
        measured,
    },
    {
        id: 'sketch-1',
        program: 'sketch',
        store: 'sketch-1',
        follows: {
            ...clock,
            k1: { kind: 'voice', store: 'voice' },
            k2: { kind: 'signal', store: 'store-a' },
        },
        frame: frame(100, 420),
        measured,
    },
];

const scene = (extra: readonly Process[] = []): Documents => {
    const workspace = defaultWorkspace({ width: 1400, height: 900 }, inputsFor);

    return {
        workspace: {
            ...workspace,
            processes: [...windows, ...extra],
            stores: [
                ...workspace.stores,
                {
                    id: 'store-a',
                    program: 'signal',
                    name: 'Melody',
                    kept: true,
                    copy: null,
                    clock: null,
                },
                {
                    id: 'store-b',
                    program: 'signal',
                    name: 'Swell',
                    kept: true,
                    copy: null,
                    clock: null,
                },
                {
                    id: 'sketch-1',
                    program: 'sketch',
                    name: 'Chladni',
                    kept: false,
                    copy: null,
                    clock: null,
                },
            ],
            sections: [
                {
                    id: 'section-1',
                    name: 'Twinkle',
                    rect: { x: 80, y: 80, width: 700, height: 700 },
                },
            ],
            links: [{ a: 'signal-1', b: 'voice-1' }],
        },
        settings: new Map([['sketch-1', { ...defaultSketch, formula: 'custom-1' }]]),
        todos: new Map(),
        boards: new Map(),
        notes: new Map(),
        agendas: new Map(),
        habits: new Map(),
        clocks: new Map(),
        bookmarks: new Map(),
        signals: new Map([
            [
                'store-a',
                { ...defaultSignal, sources: { phase: null, offset: null, depth: 'store-b' } },
            ],
            ['store-b', defaultSignal],
        ]),
        paintings: new Map(),
        pens: new Map(),
        voices: new Map([
            [
                'voice',
                {
                    ...defaultVoice,
                    sources: { pitch: 'store-a', volume: null, filter: null, pan: null },
                },
            ],
        ]),
        drums: new Map(),
        library: { items: [{ id: 'custom-1', label: 'Chladni', source: 'vec4 formula' }], made: 1 },
        pieces: emptyPieces,
        formulas: new Map(),
        themes: new Map(),
        looks: new Map(),
        look: 'paper',
    };
};

const playback = new Map([['timeline', { duration: 6, looping: true }]]);

const saved = (documents: Documents): Piece => {
    const captured = pieceOf(documents, playback, 'section-1');

    if (captured === null) {
        throw new Error('nothing captured');
    }

    return { ...captured, id: 'piece-1' };
};

describe('a piece', () => {
    it('keeps a section: its windows, the states they keep and follow, chains and all', () => {
        const piece = saved(scene());

        expect(piece.name).toBe('Twinkle');
        expect(piece.windows.map(({ id }) => id)).toEqual(['signal-1', 'voice-1', 'sketch-1']);
        expect(piece.windows[0]?.frame).toMatchObject({ x: 20, y: 20 });
        expect(piece.stores.map(({ id }) => id).sort()).toEqual([
            'sketch-1',
            'store-a',
            'store-b',
            'voice',
        ]);
        expect(piece.held.signals.map(([id]) => id).sort()).toEqual(['store-a', 'store-b']);
        expect(piece.formulas).toEqual([
            { id: 'custom-1', label: 'Chladni', source: 'vec4 formula' },
        ]);
        expect(piece.links).toEqual([{ a: 'signal-1', b: 'voice-1' }]);
    });

    it('places a fresh copy in view, every wire pointing at the copies', () => {
        const before = scene();
        const view = { x: 2000, y: 0, width: 1400, height: 900 };
        const after = placed(before, saved(before), view, 500, inputsFor);
        const ids = new Map(
            saved(before).stores.map(({ id }, index) => [id, `store-500-${index + 1}`]),
        );
        const sketch = after.workspace.processes.find(({ id }) => id === 'sketch-500-3');

        expect(after.workspace.processes).toHaveLength(windows.length * 2);
        expect(sketch?.follows).toEqual({
            playback: { kind: 'playback', store: 'timeline' },
            k1: { kind: 'voice', store: ids.get('voice') },
            k2: { kind: 'signal', store: ids.get('store-a') },
        });
        expect(sketch?.frame).toMatchObject({ x: 2000 + 350 + 20, y: 100 + 340 });
        expect(after.signals.get(ids.get('store-a') ?? '')?.sources.depth).toBe(ids.get('store-b'));
        expect(after.voices.get(ids.get('voice') ?? '')?.sources.pitch).toBe(ids.get('store-a'));
        expect(after.settings.get(ids.get('sketch-1') ?? '')).toMatchObject({
            formula: 'custom-1',
        });
        expect(after.library).toBe(before.library);
        expect(after.workspace.sections.at(-1)).toMatchObject({ name: 'Twinkle' });
        expect(after.workspace.stores.find(({ id }) => id === ids.get('voice'))?.name).toBe(
            'Twinkle',
        );
        expect(after.workspace.links).toContainEqual({ a: 'signal-500-1', b: 'voice-500-2' });
        expect(before.signals.get('store-a')?.sources.depth).toBe('store-b');
    });

    it('carries a clock only with a timeline window to play it, with the loop it was saved on', () => {
        const timeline: Process = {
            id: 'timeline-1',
            program: 'timeline',
            store: 'timeline',
            follows: {},
            frame: frame(420, 420),
            measured,
        };
        const piece = saved(scene([timeline]));
        const after = placed(
            scene([timeline]),
            piece,
            { x: 0, y: 0, width: 900, height: 900 },
            7,
            inputsFor,
        );
        const seeded = after.workspace.stores.find(({ clock }) => clock !== null);

        expect(piece.stores.find(({ id }) => id === 'timeline')?.clock).toEqual({
            duration: 6,
            looping: true,
        });
        expect(seeded?.program).toBe('timeline');
        expect(after.workspace.processes.find(({ id }) => id === 'signal-7-1')?.follows).toEqual({
            playback: { kind: 'playback', store: seeded?.id },
        });
    });

    it('reuses a saved formula the library already holds, and adds one it does not', () => {
        const before = scene();
        const piece = {
            ...saved(before),
            formulas: [{ id: 'custom-1' as const, label: 'X', source: 'other' }],
        };
        const after = placed(before, piece, { x: 0, y: 0, width: 900, height: 900 }, 9, inputsFor);

        expect(after.library.items.map(({ id }) => id)).toEqual(['custom-1', 'custom-2']);
        expect(after.settings.get('store-9-1')).toBeUndefined();
        expect(
            [...after.settings.values()].some(
                settings => 'formula' in settings && settings.formula === 'custom-2',
            ),
        ).toBe(true);
    });

    it('is saved and placed as one step each, and survives a round trip through storage', () => {
        const kit = documentsKit(inputsFor);
        const reduce = reduceHistory(kit);
        const documents = scene();
        const history = [
            { kind: 'pieces' as const, command: { kind: 'add' as const, piece: saved(documents) } },
        ].reduce(reduce, startTimeline(documents, seqFloor(documents)));
        const [piece] = history.present.pieces.items;
        const placedOnce = reduce(history, {
            kind: 'place',
            piece: piece?.id ?? '',
            view: { x: 0, y: 0, width: 900, height: 900 },
        });

        expect(placedOnce.present.workspace.processes).toHaveLength(windows.length * 2);
        expect(reduce(placedOnce, { kind: 'undo' }).present.workspace.processes).toHaveLength(
            windows.length,
        );
        expect(parsePieces(JSON.parse(JSON.stringify(history.present.pieces)), inputsFor)).toEqual(
            history.present.pieces,
        );
        expect(emptyLibrary.items).toEqual([]);
    });
});
