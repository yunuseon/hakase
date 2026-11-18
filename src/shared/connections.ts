type Point = { readonly x: number; readonly y: number };

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
      }
    | {
          readonly kind: 'convert';
          readonly converter: string;
          readonly source: string;
          readonly owner: 'window' | 'store';
          readonly sink: string;
          readonly input: string;
          readonly window: string;
          readonly low: number;
          readonly high: number;
      };

export type End =
    | {
          readonly kind: 'store';
          readonly id: string;
          readonly program: string;
          readonly feeds: string | null;
      }
    | {
          readonly kind: 'port';
          readonly owner: 'window' | 'store';
          readonly sink: string;
          readonly input: string;
          readonly accepts: readonly string[];
          readonly cuttable: boolean;
      }
    | {
          readonly kind: 'own';
          readonly window: string;
          readonly program: string;
          readonly store: string;
      };

export const sameEnd = (a: End, b: End): boolean => {
    switch (a.kind) {
        case 'store':
            return (
                b.kind === 'store' &&
                a.id === b.id &&
                a.program === b.program &&
                a.feeds === b.feeds
            );
        case 'port':
            return (
                b.kind === 'port' &&
                a.owner === b.owner &&
                a.sink === b.sink &&
                a.input === b.input &&
                a.cuttable === b.cuttable &&
                a.accepts.join() === b.accepts.join()
            );
        case 'own':
            return (
                b.kind === 'own' &&
                a.window === b.window &&
                a.program === b.program &&
                a.store === b.store
            );
    }
};

export const commandOf = (a: End, b: End | null): StateCommand | null => {
    if (b === null) {
        return a.kind !== 'port' || !a.cuttable
            ? null
            : a.owner === 'store'
              ? { kind: 'source', store: a.sink, param: a.input, source: null }
              : { kind: 'disconnect', window: a.sink, input: a.input };
    }

    const [store, other] = a.kind === 'store' ? [a, b] : b.kind === 'store' ? [b, a] : [null, null];

    if (store === null || other === null) {
        return null;
    }

    if (other.kind === 'port') {
        if (store.feeds === null || !other.accepts.includes(store.feeds)) {
            return null;
        }

        if (other.owner === 'store') {
            return other.sink === store.id
                ? null
                : { kind: 'source', store: other.sink, param: other.input, source: store.id };
        }

        return {
            kind: 'connect',
            window: other.sink,
            input: other.input,
            source: store.feeds,
            store: store.id,
        };
    }

    return other.kind === 'own' && other.program === store.program && other.store !== store.id
        ? { kind: 'bind', window: other.window, store: store.id }
        : null;
};

// Level out of an output and into an input, always: the direction of a wire reads from its ends.
export const WIRE_STYLES = ['curves', 'traces'] as const;
export type WireStyle = (typeof WIRE_STYLES)[number];
export const isWireStyle = (value: unknown): value is WireStyle =>
    WIRE_STYLES.some(style => style === value);
export const DEFAULT_WIRE_STYLE: WireStyle = 'curves';

export const wirePath = (from: Point, to: Point) => {
    const dx = to.x - from.x;
    const pull =
        dx >= 0
            ? Math.max(40, dx / 2)
            : Math.min(160, Math.max(60, Math.max(-dx, Math.abs(to.y - from.y)) / 2));

    return `M${from.x} ${from.y} C${from.x + pull} ${from.y} ${to.x - pull} ${to.y} ${to.x} ${to.y}`;
};

const corner = (a: Point, at: Point, b: Point, radius: number) => {
    const into = Math.hypot(at.x - a.x, at.y - a.y);
    const out = Math.hypot(b.x - at.x, b.y - at.y);
    const r = Math.min(radius, into / 2, out / 2);

    return into === 0 || out === 0
        ? ` L${at.x} ${at.y}`
        : ` L${at.x + ((a.x - at.x) / into) * r} ${at.y + ((a.y - at.y) / into) * r}` +
              ` Q${at.x} ${at.y} ${at.x + ((b.x - at.x) / out) * r} ${at.y + ((b.y - at.y) / out) * r}`;
};

export const tracePath = (from: Point, to: Point, lead = 16, radius = 8) => {
    const ahead = to.x - from.x >= 2 * lead;
    const middle = from.x + (to.x - from.x) / 2;
    const below = Math.max(from.y, to.y) + 3 * lead;
    const across = Math.abs(to.y - from.y) < 2 * lead ? below : from.y + (to.y - from.y) / 2;
    const points: readonly Point[] = ahead
        ? [from, { x: middle, y: from.y }, { x: middle, y: to.y }, to]
        : [
              from,
              { x: from.x + lead, y: from.y },
              { x: from.x + lead, y: across },
              { x: to.x - lead, y: across },
              { x: to.x - lead, y: to.y },
              to,
          ];
    const turns = points
        .slice(1, -1)
        .map((at, index) => corner(points[index] ?? at, at, points[index + 2] ?? at, radius))
        .join('');

    return `M${from.x} ${from.y}${turns} L${to.x} ${to.y}`;
};
