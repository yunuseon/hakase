import type { LinkKind, LinkView } from './components/links/links.ts';
import type { ProcessId } from './program.ts';
import { PARAMS, type Signal } from './shared/signal.ts';
import { colourOf, HOLDING } from './stores.ts';
import { followedStores } from './inputs.ts';
import { boxOf, type Process, type Workspace } from './workspace.ts';

const sourcesOf = (signals: ReadonlyMap<string, Signal>, store: string) => {
    const signal = signals.get(store);

    return signal === undefined
        ? []
        : PARAMS.flatMap(param => {
              const source = signal.sources[param];

              return source === null ? [] : [source];
          });
};

export const linksOf = (
    { processes }: Workspace,
    signals: ReadonlyMap<string, Signal>,
    peeked: ProcessId | null,
): readonly LinkView[] => {
    const peek = processes.find(({ id }) => id === peeked);

    if (peek === undefined) {
        return [];
    }

    const others = processes.filter(({ id }) => id !== peek.id);
    const keeps = (process: Process) => HOLDING[process.program] !== null;
    const keepersOf = (store: string) =>
        others.filter(process => keeps(process) && process.store === store);
    const own = keeps(peek) ? peek.store : null;
    const link = (from: Process, to: Process, kind: LinkKind, store: string) => ({
        key: `${from.id}>${to.id}:${kind}`,
        view: { from: boxOf(from), to: boxOf(to), kind, colour: colourOf(store) },
    });

    const read = [
        ...followedStores(peek.follows),
        ...(own === null ? [] : sourcesOf(signals, own)),
    ];
    const all = [
        ...read.flatMap(store =>
            keepersOf(store).map(keeper => link(keeper, peek, 'input', store)),
        ),
        ...(own === null
            ? []
            : [
                  ...others
                      .filter(
                          process =>
                              followedStores(process.follows).includes(own) ||
                              (keeps(process) && sourcesOf(signals, process.store).includes(own)),
                      )
                      .map(follower => link(peek, follower, 'output', own)),
                  ...keepersOf(own).map(sharer => link(peek, sharer, 'shared', own)),
              ]),
    ];

    return all
        .filter(({ key }, index) => all.findIndex(other => other.key === key) === index)
        .map(({ view }) => view);
};
