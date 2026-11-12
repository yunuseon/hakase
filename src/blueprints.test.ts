import { unlinkedSketch } from './components/sketch/links.ts';
import { describe, expect, it } from 'vitest';
import { defaultVoice } from './components/voice/voice.ts';
import { documentsKit, reduceHistory, seqFloor, type Documents } from './documents.ts';
import { inputsFor } from './inputs.fixture.ts';
import { emptyLibrary } from './library.ts';
import {
    emptyBlueprints,
    parseBlueprints,
    blueprintOf,
    placed,
    type Blueprint,
} from './blueprints.ts';
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
        follows: clock,
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
                    rects: [{ x: 80, y: 80, width: 700, height: 700 }],
                },
            ],
            links: [{ a: 'signal-1', b: 'voice-1' }],
        },
        settings: new Map([['sketch-1', { ...defaultSketch, formula: 'custom-1' }]]),
        tickets: new Map(),
        notes: new Map(),
        agendas: new Map(),
        habits: new Map(),
        clocks: new Map(),
        bookmarks: new Map(),
        signals: new Map([
            [
                'store-a',
                {
                    ...defaultSignal,
                    sources: { phase: null, offset: null, depth: 'store-b', time: null },
                },
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
        focusLinks: new Map(),
        pedals: new Map(),
        gates: new Map(),
        boxes: new Map(),
        sketchLinks: new Map([
            ['sketch-1', { sources: { ...unlinkedSketch.sources, k1: 'voice', k2: 'store-a' } }],
        ]),
        library: { items: [{ id: 'custom-1', label: 'Chladni', source: 'vec4 formula' }], made: 1 },
        blueprints: emptyBlueprints,
        formulas: new Map(),
        themes: new Map(),
        looks: new Map(),
        look: 'paper',
        aspect: '1:1',
    };
};

const playback = new Map([['timeline', { duration: 6, looping: true }]]);

const saved = (documents: Documents): Blueprint => {
    const captured = blueprintOf(
        documents,
        playback,
        documents.workspace.processes.map(p => p.id),
        'Twinkle',
    );

    if (captured === null) {
        throw new Error('nothing captured');
    }

    return { ...captured, id: 'blueprint-1' };
};

describe('a blueprint', () => {
    it('captures selected windows and the states they keep and follow, chains and all', () => {
        const blueprint = saved(scene());

        expect(blueprint.name).toBe('Twinkle');
        expect(blueprint.windows.map(({ id }) => id)).toEqual(['signal-1', 'voice-1', 'sketch-1']);
        expect(blueprint.windows[0]?.frame).toMatchObject({ x: 0, y: 0 });
        expect(blueprint.stores.map(({ id }) => id).sort()).toEqual([
            'sketch-1',
            'store-a',
            'store-b',
            'voice',
        ]);
        expect(blueprint.held.signals.map(([id]) => id).sort()).toEqual(['store-a', 'store-b']);
        expect(blueprint.formulas).toEqual([
            { id: 'custom-1', label: 'Chladni', source: 'vec4 formula' },
        ]);
        expect(blueprint.links).toEqual([{ a: 'signal-1', b: 'voice-1' }]);
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
        expect(sketch?.follows).toEqual({ playback: { kind: 'playback', store: 'timeline' } });
        expect(after.sketchLinks.get(ids.get('sketch-1') ?? '')?.sources).toMatchObject({
            k1: ids.get('voice'),
            k2: ids.get('store-a'),
        });
        expect(sketch?.frame).toMatchObject({ x: 2390, y: 460 });
        expect(after.signals.get(ids.get('store-a') ?? '')?.sources.depth).toBe(ids.get('store-b'));
        expect(after.voices.get(ids.get('voice') ?? '')?.sources.pitch).toBe(ids.get('store-a'));
        expect(after.settings.get(ids.get('sketch-1') ?? '')).toMatchObject({
            formula: 'custom-1',
        });
        expect(after.library).toBe(before.library);
        expect(after.workspace.sections).toEqual(before.workspace.sections);
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
        const blueprint = saved(scene([timeline]));
        const after = placed(
            scene([timeline]),
            blueprint,
            { x: 0, y: 0, width: 900, height: 900 },
            7,
            inputsFor,
        );
        const seeded = after.workspace.stores.find(({ clock }) => clock !== null);

        expect(blueprint.stores.find(({ id }) => id === 'timeline')?.clock).toEqual({
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
        const blueprint = {
            ...saved(before),
            formulas: [{ id: 'custom-1' as const, label: 'X', source: 'other' }],
        };
        const after = placed(
            before,
            blueprint,
            { x: 0, y: 0, width: 900, height: 900 },
            9,
            inputsFor,
        );

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
            {
                kind: 'blueprints' as const,
                command: { kind: 'add' as const, blueprint: saved(documents) },
            },
        ].reduce(reduce, startTimeline(documents, seqFloor(documents)));
        const [blueprint] = history.present.blueprints.items;
        const placedOnce = reduce(history, {
            kind: 'place',
            blueprint: blueprint?.id ?? '',
            view: { x: 0, y: 0, width: 900, height: 900 },
        });

        expect(placedOnce.present.workspace.processes).toHaveLength(windows.length * 2);
        expect(reduce(placedOnce, { kind: 'undo' }).present.workspace.processes).toHaveLength(
            windows.length,
        );
        expect(
            parseBlueprints(JSON.parse(JSON.stringify(history.present.blueprints)), inputsFor),
        ).toEqual(history.present.blueprints);
        expect(emptyLibrary.items).toEqual([]);
    });
});

describe('ticket blueprint migration', () => {
    it('places old todo and board states as separate ticket documents with their own views', () => {
        const saved = {
            id: 'blueprint-legacy',
            name: 'Work',
            size: { width: 700, height: 400 },
            windows: [
                {
                    id: 'todo-1',
                    program: 'todo',
                    store: 'todo',
                    follows: {},
                    frame: frame(0, 0),
                    settings: null,
                },
                {
                    id: 'board-1',
                    program: 'board',
                    store: 'board',
                    follows: {},
                    frame: frame(320, 0),
                    settings: null,
                },
            ],
            stores: [
                { id: 'todo', program: 'todo', name: 'Main' },
                { id: 'board', program: 'board', name: 'Main' },
            ],
            held: {
                todos: [
                    ['todo', { items: [{ id: 'todo-1', text: 'Buy milk', done: false }], made: 1 }],
                ],
                boards: [
                    [
                        'board',
                        {
                            columns: [
                                {
                                    id: 'column-1',
                                    title: 'Ideas',
                                    cards: [{ id: 'card-2', text: 'Ship' }],
                                },
                            ],
                            made: 2,
                        },
                    ],
                ],
            },
        };
        const blueprint = parseBlueprints({ items: [saved] }, inputsFor).items[0];
        expect(blueprint?.windows.map(({ program, store }) => [program, store])).toEqual([
            ['tickets', 'tickets'],
            ['tickets', 'board'],
        ]);
        expect(blueprint?.windows[1]?.settings).toEqual({ kind: 'tickets', view: 'board' });
        if (blueprint === undefined) {
            throw new Error('Missing migrated blueprint');
        }
        const before = scene();
        const after = placed(
            before,
            blueprint,
            { x: 0, y: 0, width: 1400, height: 900 },
            50,
            inputsFor,
        );
        const copies = after.workspace.processes.slice(before.workspace.processes.length);
        expect(copies).toHaveLength(2);
        expect(copies[0]?.store).not.toBe(copies[1]?.store);
        expect(after.tickets.get(copies[0]?.store ?? '')?.statuses[0]?.tickets[0]?.title).toBe(
            'Buy milk',
        );
        expect(after.tickets.get(copies[1]?.store ?? '')?.statuses[0]?.tickets[0]?.title).toBe(
            'Ship',
        );
    });
});

it('captures an explicit selection without any section and excludes unselected programs', () => {
    const before = scene();
    const captured = blueprintOf(
        { ...before, workspace: { ...before.workspace, sections: [] } },
        playback,
        ['voice-1', 'sketch-1'],
    );
    expect(captured?.windows.map(p => p.id)).toEqual(['voice-1', 'sketch-1']);
    expect(captured?.stores.map(s => s.id)).toContain('store-a');
    expect(captured?.links).toEqual([]);
    expect(blueprintOf(before, playback, [])).toBe(null);
});

it('pastes a temporary snapshot as one undoable step without saving a blueprint or area', () => {
    const before = scene();
    const snapshot = saved(before);
    const reduce = reduceHistory(documentsKit(inputsFor));
    const pasted = reduce(startTimeline(before, seqFloor(before)), {
        kind: 'paste',
        blueprint: snapshot,
        view: {
            x: 1000,
            y: 1000,
            width: snapshot.size.width,
            height: snapshot.size.height,
        },
    });
    expect(pasted.present.workspace.processes).toHaveLength(6);
    expect(pasted.present.blueprints).toBe(before.blueprints);
    expect(pasted.present.workspace.sections).toBe(before.workspace.sections);
    const undone = reduce(pasted, { kind: 'undo' });
    expect(undone.present.workspace.processes).toHaveLength(3);
    expect(reduce(undone, { kind: 'redo' }).present.workspace.processes).toEqual(
        pasted.present.workspace.processes,
    );
});

describe('blueprints saved before sketch links', () => {
    it("move what a saved sketch window followed into the blueprint's held links", () => {
        const parsed = parseBlueprints(
            {
                items: [
                    {
                        id: 'blueprint-1',
                        name: 'Old',
                        size: { width: 400, height: 400 },
                        windows: [
                            {
                                id: 'sketch-1',
                                program: 'sketch',
                                store: 'sketch-1',
                                frame: { x: 0, y: 0, z: 0, width: 400, height: 400 },
                                follows: {
                                    playback: { kind: 'playback', store: 'timeline' },
                                    k1: { kind: 'drums', store: 'beat' },
                                },
                            },
                        ],
                        stores: [],
                        held: {},
                        formulas: [],
                        links: [],
                    },
                ],
            },
            inputsFor,
        );
        const [blueprint] = parsed.items;

        expect(blueprint?.held.sketchLinks).toEqual([
            ['sketch-1', { sources: { ...unlinkedSketch.sources, k1: 'beat' } }],
        ]);
        expect(blueprint?.windows[0]?.follows).toEqual({
            playback: { kind: 'playback', store: 'timeline' },
        });
    });
});
