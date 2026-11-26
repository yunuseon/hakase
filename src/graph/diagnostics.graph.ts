import { asapScheduler, merge, type Observable } from 'rxjs';
import {
    auditTime,
    buffer,
    connect,
    debounceTime,
    filter,
    map,
    scan,
    share,
    shareReplay,
    startWith,
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

export const turnsOf = (streams: Streams, now: () => number): Observable<Turn> => {
    const pulses$ = merge(
        ...Object.entries(streams).map(([stream, stream$]) =>
            stream$.pipe(map(value => ({ stream, value }))),
        ),
    ).pipe(map(({ stream, value }): Pulse => ({ stream, at: now(), digest: digestOf(value) })));

    // `connect`, not `share`: the replayed values arrive while subscribing, before a shared notifier would be listening.
    return pulses$.pipe(
        connect(shared$ => shared$.pipe(buffer(shared$.pipe(debounceTime(0, asapScheduler))))),
        filter(pulses => pulses.length > 0),
        map((pulses): Turn => ({ at: pulses[0]?.at ?? now(), pulses })),
    );
};

const REPORT_MS = 250;

export const diagnosticsOf = (streams: Streams, { now }: Pick<Ports, 'now'>) => {
    const names = Object.keys(streams);
    const turns$ = turnsOf(streams, now).pipe(share());
    const log$: Observable<Log> = turns$.pipe(
        scan(recordTurn, emptyLog),
        startWith(emptyLog),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    return {
        names,
        turns$,
        log$,
        report$: log$.pipe(
            auditTime(REPORT_MS),
            map(log => reportOf(log, names, now())),
        ),
    };
};

export type Diagnostics = ReturnType<typeof diagnosticsOf>;
