import { animationFrames, defer, EMPTY, merge, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    map,
    pairwise,
    scan,
    shareReplay,
    startWith,
    switchMap,
} from 'rxjs/operators';
import { wrap01 } from '../lib/math.ts';
import type { Phase } from './drag.ts';

export type TransportCommand = 'toggle' | 'stop' | 'loop';

export const defaultDuration = 8;

export const elapsedLabel = (at: number, duration: number): string => (at * duration).toFixed(1);

export const parseDuration = (text: string): number | null => {
    const seconds = Math.round(Number(text) * 10) / 10;

    return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 600) : null;
};

export type Transport = {
    readonly at: number;
    readonly playing: boolean;
    readonly looping: boolean;
    readonly held: boolean;
};

export type Scrub = {
    readonly phase: Phase;
    readonly at: number;
};

export const initialTransport: Transport = { at: 0, playing: false, looping: true, held: false };

type TransportAction =
    | { readonly kind: 'command'; readonly command: TransportCommand }
    | { readonly kind: 'scrub'; readonly scrub: Scrub }
    | { readonly kind: 'advance'; readonly ms: number; readonly duration: number };

// The buttons cannot know which they mean, so the fold owns every flip.
const command = (transport: Transport, command: TransportCommand): Transport => {
    switch (command) {
        case 'toggle':
            return transport.playing
                ? { ...transport, playing: false }
                : { ...transport, playing: true, at: transport.at >= 1 ? 0 : transport.at };
        case 'stop':
            return { ...transport, playing: false, at: 0 };
        case 'loop':
            return { ...transport, looping: !transport.looping };
    }
};

const advance = (transport: Transport, ms: number, duration: number): Transport => {
    if (duration === 0) {
        return transport;
    }

    const at = transport.at + ms / (duration * 1000);

    if (transport.looping) {
        return { ...transport, at: wrap01(at) };
    }

    return at >= 1 ? { ...transport, at: 1, playing: false } : { ...transport, at };
};

export const reduceTransport = (transport: Transport, action: TransportAction): Transport => {
    switch (action.kind) {
        case 'command':
            return command(transport, action.command);
        case 'scrub':
            // A release ends the hold where the pointer last was; where it was let go is not a new seek.
            return action.scrub.phase === 'release'
                ? { ...transport, held: false }
                : { ...transport, at: action.scrub.at, held: true };
        case 'advance':
            return advance(transport, action.ms, action.duration);
    }
};

export type Clock = Transport & {
    readonly duration: number;
};

export const initialClock: Clock = { ...initialTransport, duration: defaultDuration };

export type ClockCommand =
    | { readonly kind: 'command'; readonly command: TransportCommand }
    | { readonly kind: 'scrub'; readonly scrub: Scrub }
    | { readonly kind: 'duration'; readonly seconds: number };

export type Clocks = ReadonlyMap<string, Clock>;

type ClocksAction =
    | { readonly kind: 'clock'; readonly store: string; readonly command: ClockCommand }
    | { readonly kind: 'copy'; readonly from: string; readonly to: string }
    | {
          readonly kind: 'seed';
          readonly to: string;
          readonly duration: number;
          readonly looping: boolean;
      }
    | { readonly kind: 'keep'; readonly stores: ReadonlySet<string> }
    | { readonly kind: 'advance'; readonly ms: number };

const running = ({ playing, held }: Clock): boolean => playing && !held;

const commanded = (clock: Clock, command: ClockCommand): Clock => {
    switch (command.kind) {
        case 'command':
            return {
                ...clock,
                ...reduceTransport(clock, { kind: 'command', command: command.command }),
            };
        case 'scrub':
            return { ...clock, ...reduceTransport(clock, { kind: 'scrub', scrub: command.scrub }) };
        case 'duration':
            return { ...clock, duration: command.seconds };
    }
};

export const reduceClocks = (clocks: Clocks, action: ClocksAction): Clocks => {
    switch (action.kind) {
        case 'clock':
            return new Map(clocks).set(
                action.store,
                commanded(clocks.get(action.store) ?? initialClock, action.command),
            );
        case 'copy': {
            const source = clocks.get(action.from);

            // A copy starts paused: two clocks starting from one press would look like one.
            return source === undefined || clocks.has(action.to)
                ? clocks
                : new Map(clocks).set(action.to, { ...source, playing: false, held: false });
        }
        case 'seed':
            return clocks.has(action.to)
                ? clocks
                : new Map(clocks).set(action.to, {
                      ...initialClock,
                      duration: action.duration,
                      looping: action.looping,
                  });
        case 'keep': {
            const kept = new Map([...clocks].filter(([store]) => action.stores.has(store)));

            return kept.size === clocks.size ? clocks : kept;
        }
        case 'advance':
            return new Map(
                [...clocks].map(([store, clock]): [string, Clock] => [
                    store,
                    running(clock)
                        ? {
                              ...clock,
                              ...reduceTransport(clock, {
                                  kind: 'advance',
                                  ms: action.ms,
                                  duration: clock.duration,
                              }),
                          }
                        : clock,
                ]),
            );
    }
};

export const createClocks$ = (
    commands$: Observable<{ readonly store: string; readonly command: ClockCommand }>,
    events$: Observable<
        | { readonly kind: 'copy'; readonly from: string; readonly to: string }
        | {
              readonly kind: 'seed';
              readonly to: string;
              readonly duration: number;
              readonly looping: boolean;
          }
        | { readonly kind: 'keep'; readonly stores: ReadonlySet<string> }
    >,
    initial: Clocks,
): Observable<Clocks> => {
    const clocks$: Observable<Clocks> = merge(
        commands$.pipe(map((stamped): ClocksAction => ({ kind: 'clock', ...stamped }))),
        events$,
        // defer: reaching the end without a loop pauses, so the frames are gated by this fold.
        defer(() => clocks$).pipe(
            // Held is not paused: the frames stop under a pointer and resume from where it lets go.
            map(clocks => [...clocks.values()].some(running)),
            distinctUntilChanged(),
            // Deltas, not elapsed: pausing then playing must resume, not jump.
            switchMap(any =>
                any
                    ? animationFrames().pipe(
                          pairwise(),
                          map(([previous, frame]) => frame.elapsed - previous.elapsed),
                      )
                    : EMPTY,
            ),
            map((ms): ClocksAction => ({ kind: 'advance', ms })),
        ),
    ).pipe(
        scan(reduceClocks, initial),
        startWith(initial),
        // Not refCount: closing the last timeline must not rewind or unloop the clock.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    return clocks$;
};

// Kept as each clock last stood still, so storage settles while one plays.
export const restedClocks = (kept: Clocks, now: Clocks): Clocks => {
    const next = new Map(
        [...now].map(([store, clock]): [string, Clock] => {
            const before = kept.get(store);

            return [
                store,
                clock.playing && before !== undefined ? { ...clock, at: before.at } : clock,
            ];
        }),
    );

    return next.size === kept.size &&
        [...next].every(([store, clock]) => sameRest(kept.get(store), clock))
        ? kept
        : next;
};

const sameRest = (a: Clock | undefined, b: Clock): boolean =>
    a !== undefined && a.at === b.at && a.looping === b.looping && a.duration === b.duration;

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

export const parseClock = (value: unknown): Clock => {
    if (typeof value !== 'object' || value === null) {
        return initialClock;
    }

    const at = field(value, 'at');
    const duration = field(value, 'duration');

    return {
        ...initialClock,
        at: typeof at === 'number' && Number.isFinite(at) ? Math.min(Math.max(at, 0), 1) : 0,
        looping: field(value, 'looping') !== false,
        duration:
            typeof duration === 'number' && Number.isFinite(duration) && duration > 0
                ? Math.min(duration, 600)
                : defaultDuration,
    };
};
