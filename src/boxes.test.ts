import { describe, expect, it } from 'vitest';
import { blueprintOf } from './blueprints.ts';
import { emptyBlueprints } from './blueprints.ts';
import { canBox } from './boxes.ts';
import { circuitTable } from './circuit.ts';
import {
    documentsKit,
    reduceHistory,
    seqFloor,
    type DocumentAction,
    type Documents,
    type History,
    type TimeCommand,
} from './documents.ts';
import { GATE_DEFAULTS, isGateKind, type Gate, type GateKind } from './gates.ts';
import { inputsFor } from './inputs.fixture.ts';
import { emptyLibrary } from './library.ts';
import { startTimeline } from './timeline.ts';
import { defaultWorkspace } from './workspace.ts';

const viewport = { width: 1400, height: 900 };

const started = (): Documents => ({
    workspace: defaultWorkspace(viewport, inputsFor),
    settings: new Map(),
    tickets: new Map(),
    notes: new Map(),
    agendas: new Map(),
    habits: new Map(),
    clocks: new Map(),
    bookmarks: new Map(),
    signals: new Map(),
    paintings: new Map(),
    pens: new Map(),
    voices: new Map(),
    drums: new Map(),
    focusLinks: new Map(),
    pedals: new Map(),
    gates: new Map(),
    boxes: new Map(),
    sketchLinks: new Map(),
    library: emptyLibrary,
    blueprints: emptyBlueprints,
    formulas: new Map(),
    themes: new Map(),
    looks: new Map(),
    look: 'paper',
});

const reduce = reduceHistory(documentsKit(inputsFor));
const run = (history: History, actions: readonly (DocumentAction | TimeCommand)[]) =>
    actions.reduce(reduce, history);

const launched = (history: History, program: GateKind, x: number) => {
    const next = run(history, [
        {
            kind: 'workspace',
            action: {
                kind: 'launch',
                program,
                size: { width: 160, height: 176 },
                viewport: { ...viewport, left: x, top: 0 },
            },
        },
    ]);
    const process = next.present.workspace.processes.at(-1);

    if (process === undefined) {
        throw new Error('nothing launched');
    }

    return { history: next, id: process.id, store: process.store };
};

const link = (store: string, param: string, source: string): DocumentAction => ({
    kind: 'link',
    store,
    param,
    source,
});

const circuit = () => {
    const start: History = startTimeline(started(), seqFloor(started()));
    const sw = launched(start, 'switch', 0);
    const pinIn = launched(sw.history, 'pin-in', 200);
    const nand = launched(pinIn.history, 'nand', 400);
    const pinOut = launched(nand.history, 'pin-out', 600);
    const lamp = launched(pinOut.history, 'lamp', 800);
    const history = run(lamp.history, [
        link(pinIn.store, 'in', sw.store),
        link(nand.store, 'a', pinIn.store),
        link(nand.store, 'b', pinIn.store),
        link(pinOut.store, 'in', nand.store),
        link(lamp.store, 'in', pinOut.store),
    ]);

    return { history, sw, pinIn, nand, pinOut, lamp };
};

const gatesOf = ({ workspace, gates }: Documents) =>
    new Map(
        workspace.stores.flatMap(({ id, program }): [string, Gate][] =>
            isGateKind(program) ? [[id, gates.get(id) ?? GATE_DEFAULTS[program]]] : [],
        ),
    );
const bitsOf = (documents: Documents, store: string) => [
    ...(circuitTable(gatesOf(documents), 4).get(store) ?? []),
];
const windows = ({ workspace }: Documents) => workspace.processes.map(({ id }) => id);

describe('components', () => {
    it('box only gates, and only with a pin out to show', () => {
        const { history, pinIn, nand, pinOut } = circuit();
        const { workspace } = history.present;
        const first = workspace.processes[0];

        expect(canBox(workspace, [pinIn.id, nand.id, pinOut.id])).toBe(true);
        expect(canBox(workspace, [pinIn.id, nand.id])).toBe(false);
        expect(canBox(workspace, [nand.id, pinOut.id, first?.id ?? ''])).toBe(false);
        expect(canBox(workspace, [nand.id, pinOut.id, 'closed'])).toBe(false);
    });

    it('keep every cable and every bit when boxed, in one undo step', () => {
        const { history, sw, pinIn, nand, pinOut, lamp } = circuit();
        const before = bitsOf(history.present, lamp.store);
        const boxed = run(history, [{ kind: 'box', ids: [pinIn.id, nand.id, pinOut.id] }]);
        const { present } = boxed;
        const box = present.workspace.processes.at(-1);

        expect(before).toEqual([1, 1, 1, 1]);
        expect(box?.program).toBe('box');
        expect(box?.follows).toEqual({});
        expect(windows(present)).not.toContain(nand.id);
        expect(present.boxes.get(box?.store ?? '')).toMatchObject({
            inputs: [pinIn.store],
            outputs: [pinOut.store],
        });
        expect(present.gates.get(lamp.store)?.sources['in']).toBe(pinOut.store);
        expect(bitsOf(present, lamp.store)).toEqual(before);
        expect(present.workspace.stores.find(({ id }) => id === nand.store)?.kept).toBe(true);

        const toggled = run(boxed, [
            { kind: 'gates', store: sw.store, command: { kind: 'toggle' } },
        ]);

        expect(bitsOf(toggled.present, lamp.store)).toEqual([0, 0, 0, 0]);
        expect(windows(run(boxed, [{ kind: 'undo' }]).present)).toEqual(windows(history.present));
    });

    it('open back into windows with fresh ids, keeping the cables', () => {
        const { history, pinIn, nand, pinOut, lamp } = circuit();
        const boxed = run(history, [{ kind: 'box', ids: [pinIn.id, nand.id, pinOut.id] }]);
        const box = boxed.present.workspace.processes.at(-1)?.id ?? '';
        const opened = run(boxed, [{ kind: 'unbox', id: box }]).present;
        const stores = opened.workspace.processes.map(({ store }) => store);

        expect(windows(opened)).not.toContain(box);
        expect(stores).toEqual(expect.arrayContaining([pinIn.store, nand.store, pinOut.store]));
        expect(windows(opened)).not.toContain(nand.id);
        expect(opened.boxes.size).toBe(0);
        expect(bitsOf(opened, lamp.store)).toEqual(bitsOf(history.present, lamp.store));
    });

    it('nest: a component boxed with a gate opens one level at a time', () => {
        const { history, pinIn, nand, pinOut, lamp } = circuit();
        const inner = run(history, [{ kind: 'box', ids: [pinIn.id, nand.id, pinOut.id] }]);
        const box = inner.present.workspace.processes.at(-1)?.id ?? '';
        const out = launched(inner, 'pin-out', 1000);
        const outer = run(out.history, [
            link(out.store, 'in', lamp.store),
            { kind: 'box', ids: [box, lamp.id, out.id] },
        ]);
        const outerBox = outer.present.workspace.processes.at(-1)?.id ?? '';
        const opened = run(outer, [{ kind: 'unbox', id: outerBox }]).present;

        expect(outer.present.boxes.size).toBe(2);
        expect(opened.workspace.processes.filter(({ program }) => program === 'box')).toHaveLength(
            1,
        );
        expect(bitsOf(opened, out.store)).toEqual([1, 1, 1, 1]);
    });

    it('keep the hidden gates through a prune', () => {
        const { history, pinIn, nand, pinOut } = circuit();
        const pruned = run(history, [
            { kind: 'box', ids: [pinIn.id, nand.id, pinOut.id] },
            { kind: 'prune' },
        ]).present;

        expect(pruned.workspace.stores.some(({ id }) => id === nand.store)).toBe(true);
        expect(pruned.gates.get(nand.store)?.sources['a']).toBe(pinIn.store);
    });

    it('place twice from a blueprint as two independent components', () => {
        const { history, pinIn, nand, pinOut } = circuit();
        const boxed = run(history, [{ kind: 'box', ids: [pinIn.id, nand.id, pinOut.id] }]);
        const box = boxed.present.workspace.processes.at(-1)?.id ?? '';
        const captured = blueprintOf(boxed.present, new Map(), [box], 'not');

        if (captured === null) {
            throw new Error('nothing captured');
        }

        const view = { x: 0, y: 0, width: 800, height: 600 };
        const placed = run(boxed, [
            { kind: 'paste', blueprint: captured, view },
            { kind: 'paste', blueprint: captured, view },
        ]).present;
        const copies = [...placed.boxes.values()].slice(1);
        const [a, b] = copies.map(({ outputs }) => outputs[0] ?? '');

        expect(copies).toHaveLength(2);
        expect(a).not.toBe(b);
        expect(a).not.toBe(pinOut.store);
        expect(placed.workspace.stores.find(({ id }) => id === a)?.kept).toBe(true);
        expect(placed.gates.get(a ?? '')?.sources['in']).not.toBe(nand.store);
        expect(placed.gates.has(placed.gates.get(a ?? '')?.sources['in'] ?? '')).toBe(true);
    });
});
