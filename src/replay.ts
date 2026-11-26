import { combineLatest, firstValueFrom, from, of, timer, EMPTY } from 'rxjs';
import {
    concatMap,
    delay,
    endWith,
    ignoreElements,
    last,
    mergeMap,
    share,
    takeUntil,
} from 'rxjs/operators';
import { coreOf } from './core.ts';
import { diagnosticsOf } from './graph/diagnostics.graph.ts';
import type { Ports } from './ports.ts';
import type { Recording } from './recording.ts';
import { STATE_KEY } from './state-store.ts';

export const replayed = (recording: Recording) => {
    const kept = new Map<string, unknown>([[STATE_KEY, recording.start]]);
    const ports: Ports = {
        frames$: EMPTY,
        wall$: of(recording.wall),
        storage: {
            read: key => kept.get(key) ?? null,
            write: (key, value) => {
                kept.set(key, value);
            },
        },
        now: () => Date.now(),
    };
    const events$ = from(recording.turns).pipe(
        concatMap(({ received }) => timer(0).pipe(mergeMap(() => received))),
        share(),
    );
    const core = coreOf({
        ports,
        inputs$: events$.pipe(mergeMap(event => (event.kind === 'input' ? [event.signal] : []))),
        documentActions$: events$.pipe(
            mergeMap(event => (event.kind === 'document' ? [event.action] : [])),
        ),
        workspaceActions$: events$.pipe(
            mergeMap(event => (event.kind === 'workspace' ? [event.action] : [])),
        ),
        pictureFrames$: () => of(null),
    });
    const diagnostics = diagnosticsOf(core.watched, ports);
    const done$ = events$.pipe(ignoreElements(), endWith(null), delay(0));

    return firstValueFrom(
        combineLatest({ log: diagnostics.log$, history: core.history$ }).pipe(
            takeUntil(done$),
            last(),
        ),
    );
};
