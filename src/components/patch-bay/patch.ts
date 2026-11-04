export type PatchStore = {
    readonly id: string;
    readonly program: string;
    readonly kind: string | null;
    readonly title: string;
    readonly name: string;
    readonly colour: string;
};

export type PatchPort = {
    readonly input: string;
    readonly title: string;
    readonly accepts: readonly string[];
    readonly optional: boolean;
    readonly bound: string | null;
};

export type OwnState = {
    readonly store: string;
    readonly name: string;
    readonly colour: string;
    readonly shown: 'tag' | 'node';
};

export type PatchWindow = {
    readonly id: string;
    readonly program: string;
    readonly label: string;
    readonly icon: string;
    readonly own: OwnState | null;
    readonly ports: readonly PatchPort[];
};

export type PatchView = {
    readonly stores: readonly PatchStore[];
    readonly windows: readonly PatchWindow[];
};

export type PatchCommand =
    | {
          readonly kind: 'connect';
          readonly window: string;
          readonly input: string;
          readonly source: string;
          readonly store: string;
      }
    | { readonly kind: 'disconnect'; readonly window: string; readonly input: string }
    | { readonly kind: 'bind'; readonly window: string; readonly store: string }
    | { readonly kind: 'locate'; readonly window: string };

export type Point = { readonly x: number; readonly y: number };

export const NODE_WIDTH = 160;
const GAP = 140;
const STORE_HEIGHT = 34;
const HEADER = 30;
const PORT_HEIGHT = 24;
const SPACING = 10;
const PAD = 12;

export type PlacedStore = PatchStore & Point & { readonly height: number; readonly anchor: Point };
export type PlacedPort = PatchPort & { readonly y: number; readonly anchor: Point };
export type PlacedWindow = Omit<PatchWindow, 'ports'> &
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

export type PatchLayout = {
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

const stacked = <T>(items: readonly T[], height: (item: T) => number) =>
    items.reduce<{ readonly tops: readonly number[]; readonly next: number }>(
        ({ tops, next }, item) => ({ tops: [...tops, next], next: next + height(item) + SPACING }),
        { tops: [], next: PAD },
    );

const windowHeight = (window: PatchWindow) => HEADER + window.ports.length * PORT_HEIGHT + 6;

export const layoutOf = ({ stores, windows }: PatchView): PatchLayout => {
    const left = PAD;
    const right = PAD + NODE_WIDTH + GAP;
    const storeTops = stacked(stores, () => STORE_HEIGHT);
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
        const own = window.own?.shown === 'node' ? storeAt(window.own.store) : undefined;
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

export const relatedTo = ({ windows, wires }: PatchLayout, focus: Focus): Related => {
    const touching = wires.filter(wire =>
        focus.kind === 'window' ? wire.window === focus.id : wire.store === focus.id,
    );
    const owner = windows.filter(window =>
        focus.kind === 'window' ? window.id === focus.id : window.own?.store === focus.id,
    );

    return {
        stores: new Set([
            ...(focus.kind === 'store' ? [focus.id] : []),
            ...touching.map(({ store }) => store),
            ...owner.flatMap(({ own }) => (own === null ? [] : [own.store])),
        ]),
        windows: new Set([...owner.map(({ id }) => id), ...touching.map(({ window }) => window)]),
        wires: new Set(touching.map(wireKey)),
    };
};
