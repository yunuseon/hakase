import { combineLatest, EMPTY, from, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import {
    createTimers$,
    restedTimers,
    samePlan,
    startedPlans,
    type Plan,
} from '../components/focus/focus.ts';
import { playbackBinding } from '../inputs.ts';
import { dayFractionOf, dayOf, minuteOfDay } from '../lib/day.ts';
import { wallClock$ } from '../lib/rx.ts';
import { routePlayback$ } from '../playback-routing.ts';
import type { AppSignal } from '../process.ts';
import { inputsFor } from '../programs.ts';
import { plansOf } from '../readings.ts';
import { createClocks$, initialClock, restedClocks } from '../shared/playhead.ts';
import { reachedFrom } from '../shared/signal.ts';
import type { Restored } from '../state-store.ts';
import { inStore, type StoreEvent, type StoreId } from '../stores.ts';
import { usedStores } from '../workspace.ts';
import type { Projections } from './projections.graph.ts';

type Reads = Pick<
    Projections,
    'workspace$' | 'structure$' | 'linked$' | 'focusLinks$' | 'agendas$'
> & {
    readonly stored: Pick<Restored, 'focus' | 'playback'>;
    readonly inputs$: Observable<AppSignal>;
};

export const timekeepingOf = ({
    workspace$,
    structure$,
    linked$,
    focusLinks$,
    agendas$,
    stored,
    inputs$,
}: Reads) => {
    // A split-off store is seeded once, from the store it was split from, as it first appears.
    const storeEvents$: Observable<StoreEvent> = merge(
        workspace$.pipe(
            map(({ stores }) => stores),
            distinctUntilChanged(),
            pairwise(),
            mergeMap(([before, after]) =>
                from(
                    after.flatMap(({ id, copy }): StoreEvent[] =>
                        copy === null || before.some(store => store.id === id)
                            ? []
                            : [{ kind: 'copy', from: copy, to: id }],
                    ),
                ),
            ),
        ),
        // Bound stores and window ids both: settings of a document program are kept by window.
        inputs$.pipe(
            filter(({ input }) => input.kind === 'prune'),
            withLatestFrom(workspace$, linked$),
            map(([, { processes }, all]): StoreEvent => ({
                kind: 'keep',
                stores: new Set([
                    ...reachedFrom(all, usedStores(processes)),
                    ...processes.map(({ id }) => id),
                ]),
            })),
        ),
    ).pipe(share());

    // The wall clock runs only while some timer follows an agenda.
    const plans$ = focusLinks$.pipe(
        switchMap(links =>
            [...links.values()].some(({ sources }) => sources.agenda !== null)
                ? combineLatest([agendas$, wallClock$]).pipe(
                      map(([agendas, now]) =>
                          plansOf(links, agendas, dayOf(now), minuteOfDay(now)),
                      ),
                  )
                : of(new Map<StoreId, Plan>()),
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const planIn = (store: StoreId): Observable<Plan | null> =>
        plans$.pipe(
            map(plans => plans.get(store) ?? null),
            distinctUntilChanged(samePlan),
        );

    const timers$ = createTimers$(
        merge(
            inputs$.pipe(
                mergeMap(({ store, input }) =>
                    input.kind === 'focus' ? of({ store, command: input.command }) : EMPTY,
                ),
            ),
            // A block that starts sets the timer aside, so nothing ticks under it.
            plans$.pipe(
                startWith(new Map<StoreId, Plan>()),
                pairwise(),
                mergeMap(([before, after]) =>
                    startedPlans(before, after).map(store => ({
                        store,
                        command: { kind: 'pause' } as const,
                    })),
                ),
            ),
        ),
        storeEvents$,
        stored.focus,
    );

    // Like the playhead: storage keeps where each timer last stood still, or the debounce never settles.
    const timersRested$ = timers$.pipe(scan(restedTimers, stored.focus), distinctUntilChanged());

    const seeds$ = workspace$.pipe(
        map(({ stores }) => stores),
        distinctUntilChanged(),
        pairwise(),
        mergeMap(([before, after]) =>
            after.flatMap(({ id, clock }) =>
                clock === null || before.some(store => store.id === id)
                    ? []
                    : [{ kind: 'seed' as const, to: id, ...clock }],
            ),
        ),
    );

    const playbacks$ = createClocks$(
        routePlayback$(
            inputs$,
            structure$.pipe(
                map(({ processes }) =>
                    processes.map(process => ({
                        id: process.id,
                        clock: playbackBinding(
                            inputsFor(process.program),
                            process.store,
                            process.follows,
                        ),
                    })),
                ),
            ),
        ),
        merge(storeEvents$, seeds$),
        stored.playback,
        wallClock$.pipe(map(dayFractionOf)),
    );

    // Where each clock last rested: storage need not follow the playhead every frame it runs.
    const playbacksRested$ = playbacks$.pipe(
        scan(restedClocks, stored.playback),
        distinctUntilChanged(),
    );

    const playbackIn = inStore(playbacks$, initialClock);

    return { plans$, planIn, timers$, timersRested$, playbacks$, playbacksRested$, playbackIn };
};

export type Timekeeping = ReturnType<typeof timekeepingOf>;
