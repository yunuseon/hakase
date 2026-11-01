import { isProgramId, PROGRAM_IDS, type ProgramId } from './program.ts';
import { colourOf, HOLDING, MAIN, type StoreEntry, type StoreId } from './stores.ts';
import type { Process } from './workspace.ts';

export const GLOBALS = [
    'workspace',
    'transport',
    'appearance',
    'formulas',
    'themes',
    'library',
] as const;
export type Global = (typeof GLOBALS)[number];

const isGlobal = (value: string): value is Global => GLOBALS.some(name => name === value);

export type Target =
    | { readonly kind: 'store'; readonly program: ProgramId; readonly store: StoreId }
    | { readonly kind: 'global'; readonly name: Global };

export const targetId = (target: Target): string =>
    target.kind === 'store' ? `store:${target.program}:${target.store}` : `global:${target.name}`;

export const parseTarget = (id: string): Target | null => {
    const [kind, first = '', ...rest] = id.split(':');

    if (kind === 'global') {
        return isGlobal(first) ? { kind: 'global', name: first } : null;
    }

    return kind === 'store' && isProgramId(first) && rest.length > 0
        ? { kind: 'store', program: first, store: rest.join(':') }
        : null;
};

export type CatalogItem = {
    readonly id: string;
    readonly label: string;
    readonly colour: string | null;
    readonly users: number | null;
};

export type CatalogGroup = {
    readonly title: string;
    readonly items: readonly CatalogItem[];
};

const storesOf = (program: ProgramId, stores: readonly StoreEntry[]): readonly StoreEntry[] => {
    const own = stores.filter(store => store.program === program);

    // A document's main store exists with no window open, so it is listed even then.
    return HOLDING[program]?.holds === 'document' && !own.some(({ id }) => id === program)
        ? [{ id: program, program, name: MAIN, kept: true, copy: null }, ...own]
        : own;
};

export const sameCatalog = (a: readonly CatalogGroup[], b: readonly CatalogGroup[]): boolean =>
    a.length === b.length &&
    a.every((group, index) => {
        const other = b[index];

        return (
            other !== undefined &&
            group.title === other.title &&
            group.items.length === other.items.length &&
            group.items.every((item, at) => {
                const twin = other.items[at];

                return (
                    twin !== undefined &&
                    item.id === twin.id &&
                    item.label === twin.label &&
                    item.colour === twin.colour &&
                    item.users === twin.users
                );
            })
        );
    });

export const catalogOf = (
    stores: readonly StoreEntry[],
    processes: readonly Process[],
    titleOf: (program: ProgramId) => string,
): readonly CatalogGroup[] => [
    ...PROGRAM_IDS.flatMap((program): CatalogGroup[] => {
        const items = storesOf(program, stores).map((store): CatalogItem => ({
            id: targetId({ kind: 'store', program, store: store.id }),
            label: store.name,
            colour: colourOf(store.id),
            users: processes.filter(process => process.store === store.id).length,
        }));

        return HOLDING[program] === null || items.length === 0
            ? []
            : [{ title: titleOf(program), items }];
    }),
    {
        title: 'global',
        items: GLOBALS.map((name): CatalogItem => ({
            id: targetId({ kind: 'global', name }),
            label: name,
            colour: null,
            users: null,
        })),
    },
];
