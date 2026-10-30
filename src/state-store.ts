import type { Observable } from 'rxjs';
import { debounceTime, map, tap } from 'rxjs/operators';
import { parseAppearance, type Appearance } from './appearance.ts';
import { appearances, defaultLook, isAppearanceName, type AppearanceName } from './appearances.ts';
import { isFormulaName, type FormulaName } from './components/sketch/formulas/registry.ts';
import { parseTheme, type Theme } from './components/sketch/theme.ts';
import { isThemeName, type ThemeName } from './components/sketch/themes/registry.ts';
import { readStored, writeStored } from './lib/storage.ts';
import { clamp } from './lib/math.ts';
import type { ProcessId } from './program.ts';
import { parseSettings, type Settings } from './settings.ts';
import { defaultDuration } from './shared/playhead.ts';
import { parseWorkspace, type Workspace } from './workspace.ts';

const KEY = 'hakase.state';
const VERSION = 1;
// Read only when hakase.state is absent, so a first run after the upgrade keeps its windows and look.
const LEGACY_WORKSPACE = 'hakase.workspace';
const LEGACY_APPEARANCE = 'hakase.appearance';
const SETTLE_MS = 250;

export type Snapshot = {
    readonly workspace: Workspace;
    readonly look: AppearanceName;
    readonly looks: ReadonlyMap<AppearanceName, Appearance>;
    readonly formulas: ReadonlyMap<FormulaName, string>;
    readonly themes: ReadonlyMap<ThemeName, Theme>;
    readonly duration: number;
    readonly playhead: number;
    readonly looping: boolean;
    readonly settings: ReadonlyMap<ProcessId, Settings>;
};

export type Restored = Omit<Snapshot, 'workspace'> & {
    readonly workspace: Workspace | null;
};

const entriesOf = (value: unknown): [string, unknown][] =>
    typeof value === 'object' && value !== null ? Object.entries(value) : [];

const field = (value: unknown, key: string): unknown =>
    entriesOf(value).find(([name]) => name === key)?.[1];

const looksFrom = (value: unknown): ReadonlyMap<AppearanceName, Appearance> =>
    new Map(
        entriesOf(value).flatMap(([name, stored]): [AppearanceName, Appearance][] => {
            if (!isAppearanceName(name)) {
                return [];
            }

            const appearance = parseAppearance(stored, appearances[name]);

            return appearance === null ? [] : [[name, appearance]];
        }),
    );

const lookFrom = (value: unknown): AppearanceName =>
    typeof value === 'string' && isAppearanceName(value) ? value : defaultLook;

const formulasFrom = (value: unknown): ReadonlyMap<FormulaName, string> =>
    new Map(
        entriesOf(value).flatMap(([name, text]): [FormulaName, string][] =>
            isFormulaName(name) && typeof text === 'string' ? [[name, text]] : [],
        ),
    );

const themesFrom = (value: unknown): ReadonlyMap<ThemeName, Theme> =>
    new Map(
        entriesOf(value).flatMap(([name, stored]): [ThemeName, Theme][] => {
            const theme = isThemeName(name) ? parseTheme(stored) : null;

            return isThemeName(name) && theme !== null ? [[name, theme]] : [];
        }),
    );

const settingsFrom = (value: unknown): ReadonlyMap<ProcessId, Settings> =>
    new Map(
        entriesOf(value).flatMap(([id, stored]): [ProcessId, Settings][] => {
            const settings = parseSettings(stored);

            return settings === null ? [] : [[id, settings]];
        }),
    );

const numberFrom = (value: unknown, fallback: number, min: number, max: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;

const fresh: Restored = {
    workspace: null,
    look: defaultLook,
    looks: new Map(),
    formulas: new Map(),
    themes: new Map(),
    duration: defaultDuration,
    playhead: 0,
    looping: true,
    settings: new Map(),
};

const legacy = (): Restored => {
    const appearance = readStored(LEGACY_APPEARANCE);

    return {
        ...fresh,
        workspace: parseWorkspace(readStored(LEGACY_WORKSPACE)),
        look: lookFrom(field(appearance, 'look')),
        looks: looksFrom(field(appearance, 'edits')),
    };
};

export const restoreState = (): Restored => {
    const stored = readStored(KEY);

    if (field(stored, 'version') !== VERSION) {
        return legacy();
    }

    return {
        workspace: parseWorkspace(field(stored, 'workspace')),
        look: lookFrom(field(stored, 'look')),
        looks: looksFrom(field(stored, 'looks')),
        formulas: formulasFrom(field(stored, 'formulas')),
        themes: themesFrom(field(stored, 'themes')),
        duration: numberFrom(field(stored, 'duration'), defaultDuration, 0.1, 600),
        playhead: numberFrom(field(stored, 'playhead'), 0, 0, 1),
        looping: field(stored, 'looping') !== false,
        settings: settingsFrom(field(stored, 'settings')),
    };
};

const serialised = (snapshot: Snapshot): unknown => {
    const live = new Set(snapshot.workspace.processes.map(({ id }) => id));

    return {
        version: VERSION,
        workspace: snapshot.workspace,
        look: snapshot.look,
        looks: Object.fromEntries(snapshot.looks),
        formulas: Object.fromEntries(snapshot.formulas),
        themes: Object.fromEntries(snapshot.themes),
        duration: snapshot.duration,
        playhead: snapshot.playhead,
        looping: snapshot.looping,
        settings: Object.fromEntries([...snapshot.settings].filter(([id]) => live.has(id))),
    };
};

export const persistState$ = (snapshot$: Observable<Snapshot>): Observable<void> =>
    snapshot$.pipe(
        debounceTime(SETTLE_MS),
        tap(snapshot => {
            writeStored(KEY, serialised(snapshot));
        }),
        map(() => undefined),
    );
