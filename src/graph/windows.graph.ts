import { combineLatest, EMPTY, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    share,
    shareReplay,
    startWith,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import type {
    FollowGroup,
    StoreOption,
    SwitchGroup,
    SwitchItem,
} from '../components/window/frame.ts';
import { inputGroups } from '../input-connections.ts';
import { followedStores, playbackBinding, type Bindings, type PlaybackBinding } from '../inputs.ts';
import { liveProcess$, type ProcessSignal } from '../process.ts';
import { CATEGORIES, type ProcessId, type Slot } from '../program.ts';
import { inputsFor, programList, programOf } from '../programs.ts';
import type { Linked } from '../shared/signal.ts';
import { colourOf, HOLDING, settingsKey, withMain, type StoreId } from '../stores.ts';
import type { Process } from '../workspace.ts';
import type { Scoped } from './app-state.graph.ts';
import type { Chrome } from './chrome.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Selection } from './selection.graph.ts';
import type { StateMode } from './state-mode.graph.ts';

const sameSlot = ({ frame: a, focused }: Slot, { frame: b, focused: other }: Slot): boolean =>
    focused === other &&
    a.x === b.x &&
    a.y === b.y &&
    a.z === b.z &&
    a.width === b.width &&
    a.height === b.height;

const sameOptions = (a: readonly StoreOption[] | null, b: readonly StoreOption[] | null): boolean =>
    a === b ||
    (a !== null &&
        b !== null &&
        a.length === b.length &&
        a.every((option, index) => {
            const other = b[index];

            return (
                other !== undefined &&
                option.id === other.id &&
                option.name === other.name &&
                option.users === other.users &&
                option.current === other.current
            );
        }));

const usersOf = (processes: readonly Process[], id: StoreId): number =>
    processes.filter(
        process => process.store === id || followedStores(process.follows).includes(id),
    ).length;

type Reads = Pick<Chrome, 'canvas'> &
    Pick<Projections, 'workspace$' | 'ids$' | 'settings$' | 'linked$'> &
    Pick<Selection, 'selectedIds$'> &
    Pick<StateMode, 'wiringEvents$'> & { readonly scoped: Scoped };

export const windowsOf = ({
    canvas,
    workspace$,
    ids$,
    settings$,
    linked$,
    selectedIds$,
    wiringEvents$,
    scoped,
}: Reads) => {
    const slot$ = (id: ProcessId): Observable<Slot> =>
        workspace$.pipe(
            mergeMap(({ processes }) => {
                const index = processes.findIndex(process => process.id === id);
                const process = processes[index];

                // Depth is the position in the list, so raising is a reorder.
                return process === undefined
                    ? EMPTY
                    : of({
                          frame: { ...process.frame, z: index + 1 },
                          focused: index === processes.length - 1,
                      });
            }),
            distinctUntilChanged(sameSlot),
        );

    const binding$ = (id: ProcessId): Observable<StoreId> =>
        workspace$.pipe(
            mergeMap(({ processes }) => {
                const process = processes.find(candidate => candidate.id === id);

                return process === undefined ? EMPTY : of(process.store);
            }),
            distinctUntilChanged(),
        );

    const followOptions$ = ({
        id,
        program,
    }: Process): Observable<readonly FollowGroup[] | null> => {
        const inputs = inputsFor(program);
        const definitions = Object.values(inputs);
        const signals$ = definitions.some(definition => definition.from === 'store')
            ? linked$
            : of(new Map<string, Linked>());

        return definitions.every(definition => definition.from === 'own')
            ? of(null)
            : combineLatest([workspace$, signals$]).pipe(
                  map(([{ processes, stores }, signals]) => {
                      const process = processes.find(process => process.id === id);

                      return process === undefined
                          ? []
                          : inputGroups(process, inputs, processes, stores, signals);
                  }),
                  distinctUntilChanged(
                      (a, b) =>
                          a.length === b.length &&
                          a.every((group, index) =>
                              sameOptions(group.options, b[index]?.options ?? null),
                          ),
                  ),
              );
    };

    // null for a program that keeps no state of its own: its window shows no chip.
    const storeOptions$ = ({ id, program }: Process): Observable<readonly StoreOption[] | null> =>
        HOLDING[program] === null
            ? of(null)
            : workspace$.pipe(
                  map(({ processes, stores }) => {
                      const current = processes.find(process => process.id === id)?.store;

                      return stores
                          .filter(store => store.program === program)
                          .map((store): StoreOption => ({
                              id: store.id,
                              name: store.name,
                              colour: colourOf(store.id),
                              users: usersOf(processes, store.id),
                              current: store.id === current,
                          }));
                  }),
                  distinctUntilChanged(sameOptions),
              );

    const switches$: Observable<readonly SwitchGroup[]> = workspace$.pipe(
        map(({ processes, stores }) =>
            stores
                .map(
                    ({ id, name }) =>
                        `${id}:${name}:${processes.filter(p => p.store === id).length}`,
                )
                .join('|'),
        ),
        distinctUntilChanged(),
        withLatestFrom(workspace$),
        map(([, { processes, stores }]) =>
            CATEGORIES.map((category): SwitchGroup => ({
                title: category.title,
                items: programList
                    .filter(program => program.category === category.id)
                    .map((program): SwitchItem => ({
                        id: program.id,
                        title: program.title,
                        icon: program.icon,
                        minimum: program.minimum,
                        current: false,
                        stores:
                            HOLDING[program.id] === null
                                ? null
                                : withMain(program.id, stores).map((store): StoreOption => ({
                                      id: store.id,
                                      name: store.name,
                                      colour: colourOf(store.id),
                                      users: usersOf(processes, store.id),
                                      current: false,
                                  })),
                    })),
            })).filter(({ items }) => items.length > 0),
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const followsOf$ = (id: ProcessId): Observable<Bindings> =>
        workspace$.pipe(
            mergeMap(({ processes }) => {
                const process = processes.find(candidate => candidate.id === id);

                return process === undefined ? EMPTY : of(process.follows);
            }),
            distinctUntilChanged(),
        );

    const clockOf$ = (id: ProcessId): Observable<PlaybackBinding | null> =>
        workspace$.pipe(
            map(({ processes }) => {
                const process = processes.find(candidate => candidate.id === id);

                return process === undefined
                    ? null
                    : playbackBinding(inputsFor(process.program), process.store, process.follows);
            }),
            distinctUntilChanged((a, b) => a?.store === b?.store),
        );

    const appeared$: Observable<Process> = workspace$.pipe(
        map(({ processes }) => processes),
        startWith<readonly Process[]>([]),
        pairwise(),
        mergeMap(([before, after]) =>
            after.filter(process => !before.some(({ id }) => id === process.id)),
        ),
    );

    const signals$: Observable<ProcessSignal> = appeared$.pipe(
        mergeMap(process => {
            const program = programOf(process.program);

            return program === undefined
                ? EMPTY
                : liveProcess$(
                      program,
                      {
                          id: process.id,
                          slot$: slot$(process.id),
                          store$: binding$(process.id),
                          clock$: clockOf$(process.id),
                          settings$: binding$(process.id).pipe(
                              switchMap(store =>
                                  settings$.pipe(
                                      map(all =>
                                          all.get(settingsKey(process.program, store, process.id)),
                                      ),
                                  ),
                              ),
                              distinctUntilChanged(),
                          ),
                      },
                      scoped(binding$(process.id), clockOf$(process.id), followsOf$(process.id)),
                      canvas,
                      storeOptions$(process),
                      switches$.pipe(
                          map(groups =>
                              groups.map(group => ({
                                  ...group,
                                  items: group.items.map(item => ({
                                      ...item,
                                      current: item.id === process.program,
                                  })),
                              })),
                          ),
                      ),
                      followOptions$(process),
                      wiringEvents$.pipe(
                          mergeMap(event =>
                              event.kind === 'manage' && event.window === process.id
                                  ? of(true)
                                  : EMPTY,
                          ),
                      ),
                      selectedIds$.pipe(
                          map(ids => ids.includes(process.id)),
                          distinctUntilChanged(),
                      ),
                      ids$.pipe(filter(ids => !ids.includes(process.id))),
                  );
        }),
        share(),
    );

    const inputs$ = signals$.pipe(
        mergeMap(signal => (signal.to === 'app' ? of(signal) : EMPTY)),
        share(),
    );

    return { signals$, inputs$ };
};
