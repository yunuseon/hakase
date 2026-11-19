import { merge, type Observable } from 'rxjs';
import { filter, mergeMap, scan, shareReplay, startWith } from 'rxjs/operators';
import { toggledSolo } from '../mix.ts';
import type { AppSignal } from '../protocol.ts';
import type { StoreId } from '../stores.ts';

const none: ReadonlySet<StoreId> = new Set();

// Neither is saved: a browser starts sound only inside a click, so a reload must never start it on its own.
export const soundOf = ({
    inputs$,
    navigator,
}: {
    readonly inputs$: Observable<AppSignal>;
    readonly navigator: { readonly listens$: Observable<void> };
}) => ({
    listening$: merge(
        inputs$.pipe(filter(({ input }) => input.kind === 'listen')),
        navigator.listens$,
    ).pipe(
        scan(on => !on, false),
        startWith(false),
        shareReplay({ bufferSize: 1, refCount: false }),
    ),
    soloed$: inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'solo' ? [input.store] : [])),
        scan(toggledSolo, none),
        startWith(none),
        shareReplay({ bufferSize: 1, refCount: false }),
    ),
});

export type SoundState = ReturnType<typeof soundOf>;
