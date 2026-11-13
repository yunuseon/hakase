import { linkedSketch, SKETCH_PARAMS, type SketchLink } from './components/sketch/links.ts';
import { CONVERTER_DEFAULTS, type Converter } from './converters.ts';
import type { Gate } from './gates.ts';
import type { Pedal } from './pedals.ts';
import { MAIN, type StoreEntry, type StoreId } from './stores.ts';

export type Wired = {
    readonly stores: readonly StoreEntry[];
    readonly sketchLinks: ReadonlyMap<StoreId, SketchLink>;
    readonly pedals: ReadonlyMap<StoreId, Pedal>;
    readonly gates: ReadonlyMap<StoreId, Gate>;
    readonly converters: ReadonlyMap<StoreId, Converter>;
};

export const envelopeOf = (sound: StoreId): StoreId => `envelope-of-${sound}`;

const programOf = (stores: readonly StoreEntry[], id: StoreId) =>
    stores.find(store => store.id === id)?.program ?? id;

const isSound = (stores: readonly StoreEntry[], id: string | null): id is StoreId =>
    id !== null && ['voice', 'drums'].includes(programOf(stores, id));

const relinked = <T extends { readonly sources: Readonly<Record<string, string | null>> }>(
    value: T,
    swap: (source: string | null) => string | null,
): T => ({
    ...value,
    sources: Object.fromEntries(
        Object.entries(value.sources).map(([param, source]) => [param, swap(source)]),
    ),
});

export const enveloped = (wired: Wired): Wired => {
    const read = [
        ...[...wired.sketchLinks.values()].flatMap(link =>
            SKETCH_PARAMS.map(param => link.sources[param]),
        ),
        ...[...wired.pedals.values(), ...wired.gates.values()].flatMap(({ sources }) =>
            Object.values(sources),
        ),
    ];
    const sounds = [...new Set(read.filter(source => isSound(wired.stores, source)))];

    if (sounds.length === 0) {
        return wired;
    }

    const swap = (source: string | null) =>
        isSound(wired.stores, source) ? envelopeOf(source) : source;
    const made = sounds.filter(sound => !wired.stores.some(({ id }) => id === envelopeOf(sound)));

    return {
        stores: [
            ...wired.stores,
            ...made.map((sound): StoreEntry => ({
                id: envelopeOf(sound),
                program: 'sound-level',
                name: `${wired.stores.find(({ id }) => id === sound)?.name ?? MAIN} level`,
                kept: true,
                copy: null,
                clock: null,
            })),
        ],
        sketchLinks: new Map(
            [...wired.sketchLinks].map(([id, link]) => [
                id,
                SKETCH_PARAMS.reduce(
                    (next, param) => linkedSketch(next, param, swap(next.sources[param])),
                    link,
                ),
            ]),
        ),
        pedals: new Map([...wired.pedals].map(([id, pedal]) => [id, relinked(pedal, swap)])),
        gates: new Map([...wired.gates].map(([id, gate]) => [id, relinked(gate, swap)])),
        converters: new Map([
            ...wired.converters,
            ...made.map((sound): [StoreId, Converter] => [
                envelopeOf(sound),
                { ...CONVERTER_DEFAULTS['sound-level'], sources: { in: sound, time: null } },
            ]),
        ]),
    };
};
