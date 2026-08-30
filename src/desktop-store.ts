import type { Observable } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';
import { parseDesktop, type Desktop } from './desktop.ts';
import { readStored, writeStored } from './lib/storage.ts';

const KEY = 'hakase.desktop';

export const restoreDesktop = (): Desktop | null => parseDesktop(readStored(KEY));

const SETTLE_MS = 250;

export const persistDesktop$ = (desktop$: Observable<Desktop>): Observable<void> =>
    desktop$.pipe(
        debounceTime(SETTLE_MS),
        tap(desktop => {
            writeStored(KEY, desktop);
        }),
        map(() => undefined),
    );
