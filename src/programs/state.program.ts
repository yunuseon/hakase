import { asyncScheduler, combineLatest, merge, of } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    scan,
    shareReplay,
    startWith,
    switchMap,
    throttleTime,
    withLatestFrom,
} from 'rxjs/operators';
import { HksStateMap } from '../components/state-map/state-map.component.ts';
import { displayable, rowsOf, toggled, type Plain } from '../components/state-map/rows.ts';
import {
    focusedStores,
    layoutOf,
    unusedOf,
    type GraphStore,
} from '../components/state-map/state-map.ts';
import type { AppInput, Program } from '../program.ts';

const READ_MS = 250;

const keyOf = (target: string, path: string) => `${target}\n${path}`;

export const stateProgram = {
    id: 'state',
    inputs: {},
    title: 'state',
    category: 'system',
    icon: 'M5 6 h3 M5 12 h3 M5 18 h3 M16 6 h3 M16 12 h3 M16 18 h3 M8 6 C 12 6, 12 12, 16 12 M8 18 C 12 18, 12 6, 16 6',
    size: { width: 520, height: 560 },
    minimum: { width: 360, height: 260 },
    launch: () => {
        const stateMap = new HksStateMap();

        return {
            element: stateMap,
            run$: ({ graph$, inspect$ }) => {
                const layout$ = graph$.pipe(
                    map(layoutOf),
                    shareReplay({ bufferSize: 1, refCount: true }),
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

                return merge(
                    stateMap
                        .connect$(
                            layout$,
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
                            layout$.pipe(map(unusedOf)),
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
                    stateMap.commands$.pipe(
                        map((command): AppInput => {
                            switch (command.kind) {
                                case 'locate':
                                    return { kind: 'locate', id: command.window };
                                case 'prune':
                                    return { kind: 'prune' };
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
