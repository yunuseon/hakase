export type PatchSource = {
    readonly id: string;
    readonly kind: string;
    readonly store: string;
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

export type PatchSink = {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly ports: readonly PatchPort[];
};

export type PatchView = {
    readonly sources: readonly PatchSource[];
    readonly sinks: readonly PatchSink[];
};

export type PatchCommand =
    | {
          readonly kind: 'connect';
          readonly sink: string;
          readonly input: string;
          readonly source: string;
          readonly store: string;
      }
    | { readonly kind: 'disconnect'; readonly sink: string; readonly input: string }
    | { readonly kind: 'reveal'; readonly sink: string };

export type Point = { readonly x: number; readonly y: number };

export const NODE_WIDTH = 150;
const GAP = 140;
const SOURCE_HEIGHT = 34;
const HEADER = 30;
const PORT_HEIGHT = 24;
const SPACING = 10;
const PAD = 12;

export type PlacedSource = PatchSource &
    Point & { readonly height: number; readonly anchor: Point };
export type PlacedPort = PatchPort & { readonly y: number; readonly anchor: Point };
export type PlacedSink = Omit<PatchSink, 'ports'> &
    Point & { readonly height: number; readonly ports: readonly PlacedPort[] };

export type Wire = {
    readonly sink: string;
    readonly input: string;
    readonly colour: string;
    readonly path: string;
    readonly removable: boolean;
};

export type PatchLayout = {
    readonly width: number;
    readonly height: number;
    readonly sources: readonly PlacedSource[];
    readonly sinks: readonly PlacedSink[];
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

const sinkHeight = (sink: PatchSink) => HEADER + sink.ports.length * PORT_HEIGHT + 6;

export const layoutOf = ({ sources, sinks }: PatchView): PatchLayout => {
    const left = PAD;
    const right = PAD + NODE_WIDTH + GAP;
    const sourceTops = stacked(sources, () => SOURCE_HEIGHT);
    const sinkTops = stacked(sinks, sinkHeight);

    const placedSources = sources.map((source, index): PlacedSource => {
        const y = sourceTops.tops[index] ?? PAD;

        return {
            ...source,
            x: left,
            y,
            height: SOURCE_HEIGHT,
            anchor: { x: left + NODE_WIDTH, y: y + SOURCE_HEIGHT / 2 },
        };
    });

    const placedSinks = sinks.map((sink, index): PlacedSink => {
        const y = sinkTops.tops[index] ?? PAD;

        return {
            ...sink,
            x: right,
            y,
            height: sinkHeight(sink),
            ports: sink.ports.map((port, at) => {
                const portY = y + HEADER + at * PORT_HEIGHT;

                return { ...port, y: portY, anchor: { x: right, y: portY + PORT_HEIGHT / 2 } };
            }),
        };
    });

    const wires = placedSinks.flatMap(sink =>
        sink.ports.flatMap((port): Wire[] => {
            const source = placedSources.find(({ id }) => id === port.bound);

            return source === undefined
                ? []
                : [
                      {
                          sink: sink.id,
                          input: port.input,
                          colour: source.colour,
                          path: wirePath(source.anchor, port.anchor),
                          removable: port.optional,
                      },
                  ];
        }),
    );

    return {
        width: right + NODE_WIDTH + PAD,
        height: Math.max(sourceTops.next, sinkTops.next) + PAD - SPACING,
        sources: placedSources,
        sinks: placedSinks,
        wires,
    };
};

export const accepts = (port: PatchPort, source: PatchSource) => port.accepts.includes(source.kind);
