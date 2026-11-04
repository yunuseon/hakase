import type { Row } from './rows.ts';

export type GraphStore = {
    readonly id: string;
    readonly target: string;
    readonly global: boolean;
    readonly program: string;
    readonly kind: string | null;
    readonly title: string;
    readonly name: string;
    readonly colour: string;
    readonly ports: readonly GraphPort[];
};

export type GraphPort = {
    readonly input: string;
    readonly title: string;
    readonly accepts: readonly string[];
    readonly optional: boolean;
    readonly bound: string | null;
};

export type GraphWindow = {
    readonly id: string;
    readonly program: string;
    readonly label: string;
    readonly icon: string;
    readonly own: string | null;
    readonly ports: readonly GraphPort[];
};

export type StateGraph = {
    readonly stores: readonly GraphStore[];
    readonly windows: readonly GraphWindow[];
};

export type StateCommand =
    | {
          readonly kind: 'connect';
          readonly window: string;
          readonly input: string;
          readonly source: string;
          readonly store: string;
      }
    | { readonly kind: 'disconnect'; readonly window: string; readonly input: string }
    | { readonly kind: 'bind'; readonly window: string; readonly store: string }
    | { readonly kind: 'locate'; readonly window: string }
    | { readonly kind: 'prune' }
    | {
          readonly kind: 'source';
          readonly store: string;
          readonly param: string;
          readonly source: string | null;
      };

export type Point = { readonly x: number; readonly y: number };

export const NODE_WIDTH = 160;
const GAP = 140;
const STORE_HEIGHT = 34;
const HEADER = 30;
const PORT_HEIGHT = 24;
const SPACING = 10;
const PAD = 12;
const GROUP_GAP = 14;

export type PlacedPort = GraphPort & { readonly y: number; readonly anchor: Point };
export type PlacedStore = Omit<GraphStore, 'ports'> &
    Point & {
        readonly height: number;
        readonly anchor: Point;
        readonly ports: readonly PlacedPort[];
    };
export type PlacedWindow = Omit<GraphWindow, 'ports'> &
    Point & {
        readonly height: number;
        readonly anchor: Point;
        readonly ports: readonly PlacedPort[];
    };

export type Wire = {
    readonly kind: 'own' | 'follow' | 'source';
    readonly sink: string;
    readonly store: string;
    readonly input: string | null;
    readonly colour: string;
    readonly path: string;
    readonly removable: boolean;
};

export type GraphLayout = {
    readonly bounds: Spot & { readonly width: number; readonly height: number };
    readonly stores: readonly PlacedStore[];
    readonly windows: readonly PlacedWindow[];
    readonly wires: readonly Wire[];
};

export const wirePath = (from: Point, to: Point) => {
    const pull = Math.max(40, Math.abs(to.x - from.x) / 2);

    return `M${from.x} ${from.y} C${from.x + pull} ${from.y} ${to.x - pull} ${to.y} ${to.x} ${to.y}`;
};

const stacked = <T>(
    items: readonly T[],
    height: (item: T) => number,
    gapBefore: (item: T, index: number) => number = () => 0,
) =>
    items.reduce<{ readonly tops: readonly number[]; readonly next: number }>(
        ({ tops, next }, item, index) => {
            const top = next + gapBefore(item, index);

            return { tops: [...tops, top], next: top + height(item) + SPACING };
        },
        { tops: [], next: PAD },
    );

const portsHeight = (ports: readonly GraphPort[]) =>
    ports.length === 0 ? 0 : ports.length * PORT_HEIGHT + 6;

const windowHeight = (window: GraphWindow) => HEADER + portsHeight(window.ports);

const storeHeight = (store: GraphStore) => STORE_HEIGHT + portsHeight(store.ports);

const depthsOf = (stores: readonly GraphStore[]): ReadonlyMap<string, number> => {
    const depth = (store: GraphStore, seen: ReadonlySet<string>): number =>
        Math.max(
            0,
            ...store.ports.flatMap(({ bound }) => {
                const source = stores.find(({ id }) => id === bound);

                return source === undefined || seen.has(source.id)
                    ? []
                    : [depth(source, new Set([...seen, store.id])) + 1];
            }),
        );

    return new Map(stores.map(store => [store.id, depth(store, new Set([store.id]))]));
};

const placedPorts = (ports: readonly GraphPort[], x: number, top: number) =>
    ports.map((port, at): PlacedPort => {
        const y = top + at * PORT_HEIGHT;

        return { ...port, y, anchor: { x, y: y + PORT_HEIGHT / 2 } };
    });

export type Spot = { readonly x: number; readonly y: number };
export type Spots = Readonly<Record<string, Spot>>;

export const nodeKey = (kind: 'store' | 'window', id: string) => `${kind}:${id}`;

// Not spots[key]: the keys come from storage, and every object has a `constructor`.
const spotOf = (spots: Spots, key: string) => Object.entries(spots).find(([at]) => at === key)?.[1];

export const layoutOf = ({ stores, windows }: StateGraph, spots: Spots = {}): GraphLayout => {
    const depths = depthsOf(stores);
    const columns = Math.max(0, ...depths.values()) + 1;
    const columnX = (column: number) => PAD + column * (NODE_WIDTH + GAP);
    const right = columnX(columns);

    const placedStores = Array.from({ length: columns }, (_, column) => {
        const here = stores.filter(({ id }) => (depths.get(id) ?? 0) === column);
        const tops = stacked(here, storeHeight, (store, index) =>
            store.global && here[index - 1]?.global === false ? GROUP_GAP : 0,
        );

        return here.map((store, index): PlacedStore => {
            const spot = spotOf(spots, nodeKey('store', store.id));
            const x = spot?.x ?? columnX(column);
            const y = spot?.y ?? tops.tops[index] ?? PAD;

            return {
                ...store,
                x,
                y,
                height: storeHeight(store),
                anchor: { x: x + NODE_WIDTH, y: y + STORE_HEIGHT / 2 },
                ports: placedPorts(store.ports, x, y + STORE_HEIGHT),
            };
        });
    }).flat();

    const windowTops = stacked(windows, windowHeight);
    const placedWindows = windows.map((window, index): PlacedWindow => {
        const spot = spotOf(spots, nodeKey('window', window.id));
        const x = spot?.x ?? right;
        const y = spot?.y ?? windowTops.tops[index] ?? PAD;

        return {
            ...window,
            x,
            y,
            height: windowHeight(window),
            anchor: { x, y: y + HEADER / 2 },
            ports: placedPorts(window.ports, x, y + HEADER),
        };
    });

    const storeAt = (id: string | null) => placedStores.find(store => store.id === id);

    const portWires = (
        kind: 'follow' | 'source',
        sink: string,
        ports: readonly PlacedPort[],
    ): Wire[] =>
        ports.flatMap(port => {
            const source = storeAt(port.bound);

            return source === undefined
                ? []
                : [
                      {
                          kind,
                          sink,
                          store: source.id,
                          input: port.input,
                          colour: source.colour,
                          path: wirePath(source.anchor, port.anchor),
                          removable: port.optional,
                      },
                  ];
        });

    const wires = [
        ...placedStores.flatMap(store => portWires('source', store.id, store.ports)),
        ...placedWindows.flatMap(window => {
            const own = storeAt(window.own);

            return [
                ...(own === undefined
                    ? []
                    : [
                          {
                              kind: 'own' as const,
                              sink: window.id,
                              store: own.id,
                              input: null,
                              colour: own.colour,
                              path: wirePath(own.anchor, window.anchor),
                              removable: false,
                          },
                      ]),
                ...portWires('follow', window.id, window.ports),
            ];
        }),
    ];

    const boxes = [...placedStores, ...placedWindows];
    const left = Math.min(...boxes.map(({ x }) => x));
    const top = Math.min(...boxes.map(({ y }) => y));

    return {
        bounds:
            boxes.length === 0
                ? { x: 0, y: 0, width: 0, height: 0 }
                : {
                      x: left,
                      y: top,
                      width: Math.max(...boxes.map(({ x }) => x + NODE_WIDTH)) - left,
                      height: Math.max(...boxes.map(({ y, height }) => y + height)) - top,
                  },
        stores: placedStores,
        windows: placedWindows,
        wires,
    };
};

export type Focus = { readonly kind: 'window' | 'store'; readonly id: string };

export const wireKey = ({ sink, input }: Pick<Wire, 'sink' | 'input'>) => `${sink}:${input ?? ''}`;

export type Related = {
    readonly stores: ReadonlySet<string>;
    readonly windows: ReadonlySet<string>;
    readonly wires: ReadonlySet<string>;
};

export const relatedTo = ({ wires }: GraphLayout, focus: Focus): Related => {
    const touching = wires.filter(wire =>
        focus.kind === 'window'
            ? wire.sink === focus.id
            : wire.store === focus.id || (wire.kind === 'source' && wire.sink === focus.id),
    );
    const itself = (kind: Focus['kind']) => (focus.kind === kind ? [focus.id] : []);

    return {
        stores: new Set([
            ...itself('store'),
            ...touching.flatMap(({ kind, store, sink }) =>
                kind === 'source' ? [store, sink] : [store],
            ),
        ]),
        windows: new Set([
            ...itself('window'),
            ...touching.flatMap(({ kind, sink }) => (kind === 'source' ? [] : [sink])),
        ]),
        wires: new Set(touching.map(wireKey)),
    };
};

export const focusedStores = (layout: GraphLayout, focus: Focus | null) => {
    const present =
        focus !== null &&
        (focus.kind === 'window'
            ? layout.windows.some(({ id }) => id === focus.id)
            : layout.stores.some(({ id }) => id === focus.id));

    if (!present) {
        return [];
    }

    const { stores } = relatedTo(layout, focus);

    return layout.stores.filter(({ id }) => stores.has(id));
};

// Used is what a window keeps or follows, and whatever those follow in turn: what a prune would keep.
export const unusedOf = ({ stores, wires }: GraphLayout) => {
    const grow = (found: ReadonlySet<string>): ReadonlySet<string> => {
        const next = new Set([
            ...found,
            ...wires
                .filter(({ kind, sink }) => kind === 'source' && found.has(sink))
                .map(({ store }) => store),
        ]);

        return next.size === found.size ? found : grow(next);
    };
    const used = grow(
        new Set(wires.filter(({ kind }) => kind !== 'source').map(({ store }) => store)),
    );

    return stores.filter(({ id, global }) => !global && !used.has(id)).length;
};

export type Inspected = {
    readonly target: string;
    readonly title: string;
    readonly name: string;
    readonly colour: string;
    readonly rows: readonly Row[];
};

export const placedAt = ({ stores, windows }: GraphLayout, key: string): Spot | null =>
    stores.find(({ id }) => nodeKey('store', id) === key) ??
    windows.find(({ id }) => nodeKey('window', id) === key) ??
    null;

export const closesLoop = ({ wires }: GraphLayout, command: StateCommand) => {
    if (command.kind !== 'source' || command.source === null) {
        return false;
    }

    const grow = (found: ReadonlySet<string>): ReadonlySet<string> => {
        const next = new Set([
            ...found,
            ...wires
                .filter(({ kind, sink }) => kind === 'source' && found.has(sink))
                .map(({ store }) => store),
        ]);

        return next.size === found.size ? found : grow(next);
    };

    return grow(new Set([command.source])).has(command.store);
};
