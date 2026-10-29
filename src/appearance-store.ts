import { combineLatest, type Observable } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';
import { parseAppearance, type Appearance } from './appearance.ts';
import { appearances, defaultLook, isAppearanceName, type AppearanceName } from './appearances.ts';
import { readStored, writeStored } from './lib/storage.ts';

const KEY = 'hakase.appearance';
const SETTLE_MS = 250;

export type StoredAppearance = {
    readonly look: AppearanceName;
    readonly edits: ReadonlyMap<AppearanceName, Appearance>;
};

const editsFrom = (value: unknown): ReadonlyMap<AppearanceName, Appearance> => {
    if (typeof value !== 'object' || value === null) {
        return new Map();
    }

    return new Map(
        Object.entries(value).flatMap(
            ([name, stored]: [string, unknown]): [AppearanceName, Appearance][] => {
                if (!isAppearanceName(name)) {
                    return [];
                }

                const appearance = parseAppearance(stored, appearances[name]);

                return appearance === null ? [] : [[name, appearance]];
            },
        ),
    );
};

export const restoreAppearance = (): StoredAppearance => {
    const stored = readStored(KEY);

    if (typeof stored !== 'object' || stored === null) {
        return { look: defaultLook, edits: new Map() };
    }

    const look = 'look' in stored && typeof stored.look === 'string' ? stored.look : '';

    return {
        look: isAppearanceName(look) ? look : defaultLook,
        edits: editsFrom('edits' in stored ? stored.edits : null),
    };
};

export const persistAppearance$ = (
    look$: Observable<AppearanceName>,
    edits$: Observable<ReadonlyMap<AppearanceName, Appearance>>,
): Observable<void> =>
    combineLatest([look$, edits$]).pipe(
        debounceTime(SETTLE_MS),
        tap(([look, edits]) => {
            writeStored(KEY, { look, edits: Object.fromEntries(edits) });
        }),
        map(() => undefined),
    );
