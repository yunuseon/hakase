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
    | { readonly kind: 'prune' };

export type Point = { readonly x: number; readonly y: number };

export const NODE_WIDTH = 160;
const GAP = 140;
const STORE_HEIGHT = 34;
const HEADER = 30;
const PORT_HEIGHT = 24;
const SPACING = 10;
const PAD = 12;
const GROUP_GAP = 14;

export type PlacedStore = GraphStore & Point & { readonly height: number; readonly anchor: Point };
export type PlacedPort = GraphPort & { readonly y: number; readonly anchor: Point };
export type PlacedWindow = Omit<GraphWindow, 'ports'> &
    Point & {
        readonly height: number;
        readonly anchor: Point;
        readonly ports: readonly PlacedPort[];
    };

export type Wire = {
    readonly kind: 'own' | 'follow';
    readonly window: string;
    readonly store: string;
    readonly input: string | null;
    readonly colour: string;
    readonly path: string;
    readonly removable: boolean;
};

export type GraphLayout = {
    readonly width: number;
    readonly height: number;
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

const windowHeight = (window: GraphWindow) => HEADER + window.ports.length * PORT_HEIGHT + 6;

export const layoutOf = ({ stores, windows }: StateGraph): GraphLayout => {
    const left = PAD;
    const right = PAD + NODE_WIDTH + GAP;
    const storeTops = stacked(
        stores,
        () => STORE_HEIGHT,
        (store, index) => (store.global && stores[index - 1]?.global === false ? GROUP_GAP : 0),
    );
    const windowTops = stacked(windows, windowHeight);

    const placedStores = stores.map((store, index): PlacedStore => {
        const y = storeTops.tops[index] ?? PAD;

        return {
            ...store,
            x: left,
            y,
            height: STORE_HEIGHT,
            anchor: { x: left + NODE_WIDTH, y: y + STORE_HEIGHT / 2 },
        };
    });

    const placedWindows = windows.map((window, index): PlacedWindow => {
        const y = windowTops.tops[index] ?? PAD;

        return {
            ...window,
            x: right,
            y,
            height: windowHeight(window),
            anchor: { x: right, y: y + HEADER / 2 },
            ports: window.ports.map((port, at) => {
                const portY = y + HEADER + at * PORT_HEIGHT;

                return { ...port, y: portY, anchor: { x: right, y: portY + PORT_HEIGHT / 2 } };
            }),
        };
    });

    const storeAt = (id: string | null) => placedStores.find(store => store.id === id);

    const wires = placedWindows.flatMap(window => {
        const own = storeAt(window.own);
        const owned: Wire[] =
            own === undefined
                ? []
                : [
                      {
                          kind: 'own',
                          window: window.id,
                          store: own.id,
                          input: null,
                          colour: own.colour,
                          path: wirePath(own.anchor, window.anchor),
                          removable: false,
                      },
                  ];

        return [
            ...owned,
            ...window.ports.flatMap((port): Wire[] => {
                const source = storeAt(port.bound);

                return source === undefined
                    ? []
                    : [
                          {
                              kind: 'follow',
                              window: window.id,
                              store: source.id,
                              input: port.input,
                              colour: source.colour,
                              path: wirePath(source.anchor, port.anchor),
                              removable: port.optional,
                          },
                      ];
            }),
        ];
    });

    return {
        width: right + NODE_WIDTH + PAD,
        height: Math.max(storeTops.next, windowTops.next) + PAD - SPACING,
        stores: placedStores,
        windows: placedWindows,
        wires,
    };
};

export type Focus = { readonly kind: 'window' | 'store'; readonly id: string };

export const wireKey = ({ window, input }: Pick<Wire, 'window' | 'input'>) =>
    `${window}:${input ?? ''}`;

export type Related = {
    readonly stores: ReadonlySet<string>;
    readonly windows: ReadonlySet<string>;
    readonly wires: ReadonlySet<string>;
};

export const relatedTo = ({ wires }: GraphLayout, focus: Focus): Related => {
    const touching = wires.filter(wire =>
        focus.kind === 'window' ? wire.window === focus.id : wire.store === focus.id,
    );
    const itself = (kind: Focus['kind']) => (focus.kind === kind ? [focus.id] : []);

    return {
        stores: new Set([...itself('store'), ...touching.map(({ store }) => store)]),
        windows: new Set([...itself('window'), ...touching.map(({ window }) => window)]),
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

export const unusedOf = ({ stores, wires }: GraphLayout) =>
    stores.filter(({ id, global }) => !global && !wires.some(wire => wire.store === id)).length;

export type Inspected = {
    readonly target: string;
    readonly title: string;
    readonly name: string;
    readonly colour: string;
    readonly rows: readonly Row[];
};
