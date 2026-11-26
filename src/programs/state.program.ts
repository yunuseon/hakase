import { declarations } from '../declarations.ts';
import { asyncScheduler, combineLatest, merge, of } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    take,
    throttleTime,
    withLatestFrom,
} from 'rxjs/operators';
import { rowsOf, toggled } from '../components/state-map/rows.ts';
import { displayable, type Plain } from '../shared/plain.ts';
import {
    focusedStores,
    layoutOf,
    placedAt,
    stateMapMenu,
    unusedOf,
    type GraphStore,
} from '../components/state-map/state-map.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';
import { asStateMap, defaultStateMap } from '../settings.ts';
import { centredOn, IDENTITY, panned, zoomedAround } from '../shared/camera.ts';

const READ_MS = 250;

const keyOf = (target: string, path: string) => `${target}\n${path}`;

export const stateProgram = {
    ...declarations.state,
    size: { width: 520, height: 560 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const [{ HksStateMap }, { HksMenu }] = await Promise.all([
            import('../components/state-map/state-map.component.ts'),
            import('../shared/ui/menu.component.ts'),
        ]);
        const stateMap = new HksStateMap();
        const menu = new HksMenu();

        return {
            element: stateMap,
            actions: menu,
            run$: ({ graph$, inspect$ }, self) => {
                const settings$ = self.settings$.pipe(
                    map(asStateMap),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const layout$ = combineLatest([
                    graph$,
                    settings$.pipe(
                        map(({ positions }) => positions),
                        distinctUntilChanged(),
                    ),
                ]).pipe(
                    map(([graph, positions]) => layoutOf(graph, positions)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const camera$ = settings$.pipe(
                    map(({ camera }) => camera),
                    distinctUntilChanged(),
                );
                const stores$ = combineLatest([layout$, stateMap.focus$]).pipe(
                    map(([layout, focus]) => focusedStores(layout, focus)),
                    distinctUntilChanged(
                        (a, b) =>
                            a.length === b.length &&
                            a.every((store, index) => store.target === b[index]?.target),
                    ),
                );
                const values$ = stores$.pipe(
                    switchMap((stores: readonly GraphStore[]) =>
                        stores.length === 0
                            ? of([])
                            : combineLatest(
                                  stores.map(store =>
                                      inspect$(store.target).pipe(
                                          distinctUntilChanged(),
                                          throttleTime(READ_MS, asyncScheduler, {
                                              leading: true,
                                              trailing: true,
                                          }),
                                          map((value): readonly [GraphStore, Plain] => [
                                              store,
                                              displayable(value),
                                          ]),
                                      ),
                                  ),
                              ),
                    ),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const expanded$ = stateMap.toggles$.pipe(
                    scan(
                        (open: readonly string[], { target, path }) =>
                            toggled(open, keyOf(target, path)),
                        [],
                    ),
                    startWith([]),
                );

                const picks$ = menu.picks$.pipe(
                    map(({ id }) => id),
                    share(),
                );

                return merge(
                    menu
                        .connect$(
                            layout$.pipe(map(unusedOf), distinctUntilChanged(), map(stateMapMenu)),
                            'map actions',
                        )
                        .pipe(ignoreElements()),
                    picks$.pipe(
                        filter(id => id === 'prune'),
                        map((): AppInput => ({ kind: 'prune' })),
                    ),
                    stateMap
                        .connect$(
                            layout$,
                            camera$,
                            combineLatest([values$, expanded$]).pipe(
                                map(([values, open]) =>
                                    values.map(([{ target, title, name, colour }, value]) => ({
                                        target,
                                        title,
                                        name,
                                        colour,
                                        rows: rowsOf(
                                            value,
                                            new Set(
                                                open
                                                    .filter(key => key.startsWith(`${target}\n`))
                                                    .map(key => key.slice(target.length + 1)),
                                            ),
                                        ),
                                    })),
                                ),
                            ),
                            stateMap.copies$.pipe(
                                withLatestFrom(values$),
                                map(([target, values]) => ({
                                    target,
                                    text: JSON.stringify(
                                        values.find(([store]) => store.target === target)?.[1] ??
                                            null,
                                        null,
                                        2,
                                    ),
                                })),
                            ),
                        )
                        .pipe(ignoreElements()),
                    merge(
                        stateMap.moves$.pipe(
                            withLatestFrom(settings$, layout$),
                            mergeMap(([{ node, dx, dy }, current, layout]) => {
                                const at = placedAt(layout, node);

                                return at === null
                                    ? []
                                    : [
                                          {
                                              ...current,
                                              positions: {
                                                  ...current.positions,
                                                  [node]: { x: at.x + dx, y: at.y + dy },
                                              },
                                          },
                                      ];
                            }),
                        ),
                        stateMap.views$.pipe(
                            withLatestFrom(settings$),
                            map(([gesture, current]) => ({
                                ...current,
                                camera:
                                    gesture.kind === 'pan'
                                        ? panned(current.camera, gesture.dx, gesture.dy)
                                        : zoomedAround(current.camera, gesture.factor, gesture.at),
                            })),
                        ),
                        picks$.pipe(
                            filter(id => id === 'fit'),
                            withLatestFrom(stateMap.sizes$, settings$, layout$),
                            map(([, size, current, { bounds }]) => ({
                                ...current,
                                camera: centredOn(IDENTITY, bounds, size),
                            })),
                        ),
                        // Once, for a window that has never been arranged: a reload keeps the camera it had.
                        self.settings$.pipe(
                            take(1),
                            filter(stored => stored === undefined),
                            switchMap(() =>
                                combineLatest([layout$, stateMap.sizes$]).pipe(
                                    filter(([, { width, height }]) => width > 0 && height > 0),
                                    take(1),
                                ),
                            ),
                            map(([{ bounds }, size]) => ({
                                ...defaultStateMap,
                                camera: centredOn(IDENTITY, bounds, size),
                            })),
                        ),
                        picks$.pipe(
                            filter(id => id === 'tidy'),
                            withLatestFrom(settings$),
                            map(([, current]) => ({ ...current, positions: {} })),
                        ),
                    ).pipe(map((settings): AppInput => ({ kind: 'settings', settings }))),
                    stateMap.commands$.pipe(
                        map((command): AppInput => {
                            switch (command.kind) {
                                case 'locate':
                                    return { kind: 'locate', id: command.window };
                                case 'prune':
                                    return { kind: 'prune' };
                                case 'source':
                                    return {
                                        kind: 'modulate',
                                        store: command.store,
                                        param: command.param,
                                        source: command.source,
                                    };
                                case 'convert':
                                    return { kind: 'convert', command };
                                default:
                                    return { kind: 'wiring', command };
                            }
                        }),
                    ),
                );
            },
        };
    },
} satisfies Program;
