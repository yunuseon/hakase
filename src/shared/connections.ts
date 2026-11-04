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

export const wirePath = (from: Point, to: Point) => {
    const pull = Math.max(40, Math.abs(to.x - from.x) / 2);

    return `M${from.x} ${from.y} C${from.x + pull} ${from.y} ${to.x - pull} ${to.y} ${to.x} ${to.y}`;
};
