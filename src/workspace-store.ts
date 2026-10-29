import type { Observable } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';
import { readStored, writeStored } from './lib/storage.ts';
import { parseWorkspace, type Workspace } from './workspace.ts';

// Renamed from hakase.desktop: an old layout has shortcuts and no camera, so it is dropped.
const KEY = 'hakase.workspace';

export const restoreWorkspace = (): Workspace | null => parseWorkspace(readStored(KEY));

const SETTLE_MS = 250;

export const persistWorkspace$ = (workspace$: Observable<Workspace>): Observable<void> =>
    workspace$.pipe(
        debounceTime(SETTLE_MS),
        tap(workspace => {
            writeStored(KEY, workspace);
        }),
        map(() => undefined),
    );
