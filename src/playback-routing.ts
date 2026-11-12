import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, scan } from 'rxjs/operators';
import type { AppInput } from './program.ts';
import type { ClockCommand } from './shared/playhead.ts';
import type { PlaybackBinding } from './inputs.ts';
import type { Stamped } from './stores.ts';

export type PlaybackInput = {
    readonly from: string;
    readonly clock: PlaybackBinding | null;
    readonly input: AppInput;
};

export type PlaybackTarget = {
    readonly id: string;
    readonly clock: PlaybackBinding | null;
};

type RoutingAction =
    | { readonly kind: 'input'; readonly value: PlaybackInput }
    | { readonly kind: 'targets'; readonly targets: readonly PlaybackTarget[] };

export type Routing = {
    readonly holds: ReadonlyMap<string, string>;
    readonly commands: readonly Stamped<ClockCommand>[];
};

export const emptyRouting: Routing = { holds: new Map(), commands: [] };

const releases = (
    before: ReadonlyMap<string, string>,
    after: ReadonlyMap<string, string>,
): readonly Stamped<ClockCommand>[] =>
    [...new Set(before.values())]
        .filter(store => ![...after.values()].includes(store))
        .map(store => ({ store, command: { kind: 'scrub', scrub: { phase: 'release', at: 0 } } }));

export const reduceRouting = (routing: Routing, action: RoutingAction): Routing => {
    if (action.kind === 'targets') {
        const holds = new Map(
            [...routing.holds].filter(([id, store]) =>
                action.targets.some(target => target.id === id && target.clock?.store === store),
            ),
        );

        return { holds, commands: releases(routing.holds, holds) };
    }

    const { from, clock, input } = action.value;

    if (clock === null) {
        return { ...routing, commands: [] };
    }

    const store = clock.store;

    switch (input.kind) {
        case 'scrub': {
            if (input.phase === 'release') {
                const holds = new Map([...routing.holds].filter(([id]) => id !== from));

                return { holds, commands: releases(routing.holds, holds) };
            }

            return {
                holds: new Map(routing.holds).set(from, store),
                commands: [
                    {
                        store,
                        command: { kind: 'scrub', scrub: { phase: input.phase, at: input.at } },
                    },
                ],
            };
        }
        case 'transport':
            return {
                ...routing,
                commands: [{ store, command: { kind: 'command', command: input.command } }],
            };
        case 'duration':
            return {
                ...routing,
                commands: [{ store, command: { kind: 'duration', seconds: input.seconds } }],
            };
        case 'ticks':
            return {
                ...routing,
                commands: [{ store, command: { kind: 'ticks', count: input.count } }],
            };
        case 'day':
            return { ...routing, commands: [{ store, command: { kind: 'day' } }] };
        default:
            return { ...routing, commands: [] };
    }
};

const sameTargets = (a: readonly PlaybackTarget[], b: readonly PlaybackTarget[]): boolean =>
    a.length === b.length &&
    a.every(
        (target, index) =>
            target.id === b[index]?.id && target.clock?.store === b[index]?.clock?.store,
    );

export const routePlayback$ = (
    inputs$: Observable<PlaybackInput>,
    targets$: Observable<readonly PlaybackTarget[]>,
): Observable<Stamped<ClockCommand>> =>
    merge(
        targets$.pipe(
            distinctUntilChanged(sameTargets),
            map((targets): RoutingAction => ({ kind: 'targets', targets })),
        ),
        inputs$.pipe(map((value): RoutingAction => ({ kind: 'input', value }))),
    ).pipe(
        scan(reduceRouting, emptyRouting),
        mergeMap(({ commands }) => commands),
    );
