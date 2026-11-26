import { asapScheduler, EMPTY, merge, timer, type Observable } from 'rxjs';
import {
    buffer,
    connect,
    debounceTime,
    filter,
    map,
    scan,
    share,
    shareReplay,
    startWith,
    withLatestFrom,
} from 'rxjs/operators';
import {
    digestOf,
    emptyLog,
    recordTurn,
    reportOf,
    type Log,
    type Pulse,
    type Turn,
} from '../diagnostics.ts';
import type { Ports } from '../ports.ts';

export type Streams = Readonly<Record<string, Observable<unknown>>>;

export type Announced = {
    readonly stream: string;
    readonly value: unknown;
    readonly by: object;
};

export const turnsOf = (
    streams: Streams,
    now: () => number,
    announced$: Observable<Announced> = EMPTY,
): Observable<Turn> => {
    const pulses$ = merge(
        ...Object.entries(streams).map(([stream, stream$]) =>
            stream$.pipe(map((value): Announced | Omit<Announced, 'by'> => ({ stream, value }))),
        ),
        announced$,
    ).pipe(
        map((pulse): Pulse => ({
            stream: pulse.stream,
            at: now(),
            digest: digestOf(pulse.value),
            ...('by' in pulse ? { by: pulse.by } : {}),
        })),
    );

    // `connect`, not `share`: the replayed values arrive while subscribing, before a shared notifier would be listening.
    return pulses$.pipe(
        connect(shared$ => shared$.pipe(buffer(shared$.pipe(debounceTime(0, asapScheduler))))),
        filter(pulses => pulses.length > 0),
        map((pulses): Turn => ({ at: pulses[0]?.at ?? now(), pulses })),
    );
};

const REPORT_MS = 250;

export const diagnosticsOf = (
    streams: Streams,
    { now }: Pick<Ports, 'now'>,
    announced$: Observable<Announced> = EMPTY,
) => {
    const names = Object.keys(streams);
    const turns$ = turnsOf(streams, now, announced$).pipe(share());
    const log$: Observable<Log> = turns$.pipe(
        scan(recordTurn, emptyLog),
        startWith(emptyLog),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    return {
        names,
        turns$,
        log$,
        report$: timer(0, REPORT_MS).pipe(
            withLatestFrom(log$),
            map(([, log]) => reportOf(log, names, now())),
        ),
    };
};

export type Diagnostics = ReturnType<typeof diagnosticsOf>;
