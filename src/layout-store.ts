import type { Observable } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';
import { readStored, writeStored } from './lib/storage.ts';
import { parseLayout, type Layout } from './layout.ts';

const KEY = 'hakase.layout';

export const restoreLayout = (): Layout | null => parseLayout(readStored(KEY));

const SETTLE_MS = 250;

export const persistLayout$ = (layout$: Observable<Layout>): Observable<void> =>
    layout$.pipe(
        debounceTime(SETTLE_MS),
        tap(layout => {
            writeStored(KEY, layout.frames);
        }),
        map(() => undefined),
    );
