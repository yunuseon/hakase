import { reachedFrom, type Linked } from './shared/signal.ts';

export type Why = { readonly window: string; readonly store: string; readonly input: string };

export type WhyAction = { readonly kind: 'why'; readonly why: Why } | { readonly kind: 'clear' };

export const reduceWhy = (why: Why | null, action: WhyAction): Why | null =>
    action.kind === 'clear'
        ? null
        : why !== null &&
            why.window === action.why.window &&
            why.store === action.why.store &&
            why.input === action.why.input
          ? null
          : action.why;

const sourcesOf = (linked: ReadonlyMap<string, Linked>, store: string) =>
    Object.values(linked.get(store)?.sources ?? {}).flatMap(source =>
        source === null ? [] : [source],
    );

const sourceOf = (linked: ReadonlyMap<string, Linked>, store: string, input: string) =>
    Object.entries(linked.get(store)?.sources ?? {}).find(([name]) => name === input)?.[1] ?? null;

export const levelsFrom = (
    linked: ReadonlyMap<string, Linked>,
    source: string,
): readonly (readonly string[])[] => {
    const above = (level: readonly string[], seen: ReadonlySet<string>): string[][] => {
        const next = [...new Set(level.flatMap(id => sourcesOf(linked, id)))].filter(
            id => !seen.has(id),
        );

        return next.length === 0 ? [] : [next, ...above(next, new Set([...seen, ...next]))];
    };

    return [[source], ...above([source], new Set([source]))];
};

export const chainsOf = (
    linked: ReadonlyMap<string, Linked>,
    store: string,
    nameOf: (store: string) => string,
): ReadonlyMap<string, string> =>
    new Map(
        Object.entries(linked.get(store)?.sources ?? {}).flatMap(([input, source]) =>
            source === null
                ? []
                : [
                      [
                          input,
                          levelsFrom(linked, source)
                              .map(level => level.map(nameOf).join(' · '))
                              .join(' ← '),
                      ] as const,
                  ],
        ),
    );

export const chainLine = (input: string, chains: ReadonlyMap<string, string>, label = input) => {
    const chain = chains.get(input);

    return chain === undefined ? '' : `${label} ← ${chain}`;
};

export const sameChains = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>) =>
    a.size === b.size && [...a].every(([input, chain]) => b.get(input) === chain);

export type Traced = {
    readonly windows: ReadonlySet<string>;
    readonly stores: ReadonlySet<string>;
    readonly socket: string;
};

export const tracedOf = (
    processes: readonly { readonly id: string; readonly store: string }[],
    linked: ReadonlyMap<string, Linked>,
    why: Why | null,
): Traced | null => {
    const source = why === null ? null : sourceOf(linked, why.store, why.input);

    if (why === null || source === null || !processes.some(({ id }) => id === why.window)) {
        return null;
    }

    const stores = reachedFrom(linked, [source]);

    return {
        stores,
        windows: new Set([
            why.window,
            ...processes.flatMap(({ id, store }) => (stores.has(store) ? [id] : [])),
        ]),
        socket: `${why.window}:input:${why.input}`,
    };
};

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
    a.size === b.size && [...a].every(id => b.has(id));

export const sameTraced = (a: Traced | null, b: Traced | null) =>
    a === b ||
    (a !== null &&
        b !== null &&
        a.socket === b.socket &&
        sameSet(a.windows, b.windows) &&
        sameSet(a.stores, b.stores));
