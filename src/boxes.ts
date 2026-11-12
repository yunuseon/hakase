import { boundsOf } from './shared/area.ts';
import { GATE_DEFAULTS, isGateKind, type Gate } from './gates.ts';
import { followedBy, type InputsFor } from './inputs.ts';
import type { StoreEntry, StoreId } from './stores.ts';
import {
    boxOf,
    ownsInputs,
    processFrom,
    type Draft,
    type Process,
    type Workspace,
} from './workspace.ts';

export type Box = {
    readonly name: string;
    readonly inner: readonly Draft[];
    readonly inputs: readonly StoreId[];
    readonly outputs: readonly StoreId[];
    readonly sources: Readonly<Record<string, StoreId | null>>;
};

export type BoxCommand = { readonly kind: 'rename'; readonly name: string };

export const reduceBox = (box: Box, command: BoxCommand): Box => {
    const name = command.name.trim().slice(0, 32);

    return name === '' || name === box.name ? box : { ...box, name };
};

export const BOX_WIDTH = 240;
const BOX_HEAD = 104;
const PIN_ROW = 30;

type Parts = {
    readonly workspace: Workspace;
    readonly gates: ReadonlyMap<StoreId, Gate>;
    readonly boxes: ReadonlyMap<StoreId, Box>;
};

type Changed = Pick<Parts, 'workspace' | 'boxes'>;

export const EMPTY_BOX: Box = {
    name: 'component',
    inner: [],
    inputs: [],
    outputs: [],
    sources: {},
};

const byPlace = (a: Process, b: Process) => a.frame.y - b.frame.y || a.frame.x - b.frame.x;

const pinName = (gates: ReadonlyMap<StoreId, Gate>, { program, store }: Process) =>
    gates.get(store)?.name ??
    (program === 'pin-in' || program === 'pin-out' ? GATE_DEFAULTS[program].name : '');

export const canBox = (workspace: Workspace, ids: readonly string[]): boolean => {
    const inside = workspace.processes.filter(({ id }) => ids.includes(id));

    return (
        inside.length > 0 &&
        inside.length === ids.length &&
        inside.every(({ program }) => isGateKind(program) || program === 'box') &&
        inside.some(({ program }) => program === 'pin-out')
    );
};

export const boxed = (
    { workspace, gates, boxes }: Parts,
    ids: readonly string[],
    seq: number,
    inputsFor: InputsFor,
): Changed | null => {
    if (!canBox(workspace, ids)) {
        return null;
    }

    const inside = workspace.processes.filter(({ id }) => ids.includes(id));
    const bounds = boundsOf(inside.map(boxOf));
    const name = `component ${boxes.size + 1}`;
    const inputs = inside.filter(({ program }) => program === 'pin-in').sort(byPlace);
    const outputs = inside.filter(({ program }) => program === 'pin-out').sort(byPlace);
    const store = `store-${seq}-box`;
    const height = BOX_HEAD + PIN_ROW * (inputs.length + outputs.length);
    const clock = inside
        .map(({ follows }) => followedBy(follows, 'playback'))
        .find(binding => binding?.kind === 'playback');
    const draft: Draft = {
        id: `box-${seq}`,
        program: 'box',
        store,
        follows: clock === undefined ? {} : { playback: clock },
        frame: { x: bounds.x, y: bounds.y, z: 0, width: BOX_WIDTH, height },
        measured: { width: BOX_WIDTH, height },
    };

    if (!ownsInputs(inputsFor)(draft)) {
        return null;
    }

    const inner = inside.map((window): Draft => ({
        ...window,
        frame: { ...window.frame, x: window.frame.x - bounds.x, y: window.frame.y - bounds.y },
    }));
    const hidden = new Set(inside.map(({ store: id }) => id));
    const pins = new Map(
        [...inputs, ...outputs].map(pin => [pin.store, `${name}.${pinName(gates, pin)}`]),
    );
    const kept = (entry: StoreEntry): StoreEntry =>
        hidden.has(entry.id)
            ? { ...entry, kept: true, name: pins.get(entry.id) ?? entry.name }
            : entry;
    const remaining = workspace.processes.filter(({ id }) => !ids.includes(id));

    return {
        boxes: new Map(boxes).set(store, {
            name,
            inner,
            inputs: inputs.map(({ store: id }) => id),
            outputs: outputs.map(({ store: id }) => id),
            sources: Object.fromEntries(inside.map(({ store: id }) => [id, id])),
        }),
        workspace: {
            ...workspace,
            processes: [...remaining, draft],
            links: workspace.links.filter(({ a, b }) => !ids.includes(a) && !ids.includes(b)),
            stores: [
                ...workspace.stores.map(kept),
                { id: store, program: 'box', name, kept: true, copy: null, clock: null },
            ],
        },
    };
};

export const unboxed = (
    { workspace, boxes }: Pick<Parts, 'workspace' | 'boxes'>,
    id: string,
    seq: number,
    inputsFor: InputsFor,
): Changed | null => {
    const process = workspace.processes.find(candidate => candidate.id === id);
    const box = process === undefined ? undefined : boxes.get(process.store);

    if (process === undefined || process.program !== 'box' || box === undefined) {
        return null;
    }

    // Fresh ids from the log, never the saved ones: a box placed twice opens into two sets of windows.
    const restored = box.inner
        .map((window, index): Draft => ({
            ...window,
            id: `${window.program}-${seq}-${index + 1}`,
            frame: {
                ...window.frame,
                x: process.frame.x + window.frame.x,
                y: process.frame.y + window.frame.y,
                z: 0,
            },
        }))
        .filter(ownsInputs(inputsFor));

    return {
        boxes: new Map([...boxes].filter(([store]) => store !== process.store)),
        workspace: {
            ...workspace,
            processes: [
                ...workspace.processes.filter(({ id: other }) => other !== id),
                ...restored,
            ],
            links: workspace.links.filter(({ a, b }) => a !== id && b !== id),
            stores: workspace.stores.filter(({ id: store }) => store !== process.store),
        },
    };
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const ids = (value: unknown): readonly StoreId[] =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

export const parseBox = (value: unknown, inputsFor: InputsFor): Box | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const name = field(value, 'name');
    const inner = field(value, 'inner');
    const sources = field(value, 'sources');
    const windows = Array.isArray(inner)
        ? inner.flatMap((stored: unknown) => {
              const draft = processFrom(stored, inputsFor);

              return draft === null ? [] : [draft];
          })
        : [];

    return windows.length === 0
        ? null
        : {
              name: typeof name === 'string' ? name.slice(0, 32) : 'component',
              inner: windows,
              inputs: ids(field(value, 'inputs')),
              outputs: ids(field(value, 'outputs')),
              sources: Object.fromEntries(
                  typeof sources === 'object' && sources !== null
                      ? Object.entries(sources).flatMap(([key, source]) =>
                            typeof source === 'string' ? [[key, source]] : [],
                        )
                      : windows.map(({ store }) => [store, store]),
              ),
          };
};

export type Pin = { readonly store: StoreId; readonly name: string; readonly bits: Uint8Array };

export type BoxReading = {
    readonly name: string;
    readonly ticks: number;
    readonly inputs: readonly Pin[];
    readonly outputs: readonly Pin[];
};

export const boxReading = (
    box: Box,
    gates: ReadonlyMap<StoreId, Gate>,
    table: ReadonlyMap<StoreId, Uint8Array>,
    ticks: number,
): BoxReading => {
    const pin = (store: StoreId): Pin => ({
        store,
        name: gates.get(store)?.name ?? store,
        bits: table.get(store) ?? new Uint8Array(ticks),
    });

    return { name: box.name, ticks, inputs: box.inputs.map(pin), outputs: box.outputs.map(pin) };
};
