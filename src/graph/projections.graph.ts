import type { Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';
import type { Appearance } from '../appearance.ts';
import { appearances, type AppearanceName } from '../appearances.ts';
import { linkedOf, type History } from '../documents.ts';
import type { ProcessId, Written } from '../program.ts';
import type { Workspace } from '../workspace.ts';

const sameIds = (a: readonly ProcessId[], b: readonly ProcessId[]): boolean =>
    a.length === b.length && a.every((id, index) => id === b[index]);

export const projectionsOf = (history$: Observable<History>) => {
    const documents$ = history$.pipe(map(({ present }) => present));

    const workspace$: Observable<Workspace> = documents$.pipe(
        map(({ workspace }) => workspace),
        distinctUntilChanged(),
    );
    const camera$ = workspace$.pipe(
        map(({ camera }) => camera),
        distinctUntilChanged(),
    );
    const ids$ = workspace$.pipe(
        map(({ processes }) => processes.map(({ id }) => id)),
        distinctUntilChanged(sameIds),
    );

    const settings$ = documents$.pipe(
        map(({ settings }) => settings),
        distinctUntilChanged(),
    );
    const tickets$ = documents$.pipe(
        map(({ tickets }) => tickets),
        distinctUntilChanged(),
    );
    const notes$ = documents$.pipe(
        map(({ notes }) => notes),
        distinctUntilChanged(),
    );
    const agendas$ = documents$.pipe(
        map(({ agendas }) => agendas),
        distinctUntilChanged(),
    );
    const habits$ = documents$.pipe(
        map(({ habits }) => habits),
        distinctUntilChanged(),
    );
    const clocks$ = documents$.pipe(
        map(({ clocks }) => clocks),
        distinctUntilChanged(),
    );
    const waves$ = documents$.pipe(
        map(({ signals }) => signals),
        distinctUntilChanged(),
    );
    const bookmarks$ = documents$.pipe(
        map(({ bookmarks }) => bookmarks),
        distinctUntilChanged(),
    );
    const paintings$ = documents$.pipe(
        map(({ paintings }) => paintings),
        distinctUntilChanged(),
    );
    const pens$ = documents$.pipe(
        map(({ pens }) => pens),
        distinctUntilChanged(),
    );
    const voices$ = documents$.pipe(
        map(({ voices }) => voices),
        distinctUntilChanged(),
    );
    const drums$ = documents$.pipe(
        map(({ drums }) => drums),
        distinctUntilChanged(),
    );
    const linked$ = documents$.pipe(
        distinctUntilChanged(
            (a, b) =>
                a.signals === b.signals &&
                a.pens === b.pens &&
                a.voices === b.voices &&
                a.drums === b.drums &&
                a.focusLinks === b.focusLinks,
        ),
        map(linkedOf),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const focusLinks$ = documents$.pipe(
        map(({ focusLinks }) => focusLinks),
        distinctUntilChanged(),
    );
    const library$ = documents$.pipe(
        map(({ library }) => library),
        distinctUntilChanged(),
    );
    const blueprints$ = documents$.pipe(
        map(({ blueprints }) => blueprints),
        distinctUntilChanged(),
    );

    // Keyed by formula: one edit reaches every process showing that formula.
    const edits$ = documents$.pipe(
        map(({ formulas }) => formulas),
        distinctUntilChanged(),
    );
    const palettes$ = documents$.pipe(
        map(({ themes: all }) => all),
        distinctUntilChanged(),
    );
    const look$ = documents$.pipe(
        map(({ look }) => look),
        distinctUntilChanged(),
    );
    const looks$ = documents$.pipe(
        map(({ looks }) => looks),
        distinctUntilChanged(),
    );
    const appearance$ = (name: AppearanceName): Observable<Written<Appearance>> =>
        looks$.pipe(map(all => all.get(name) ?? { value: appearances[name], from: null }));

    return {
        history$,
        documents$,
        workspace$,
        camera$,
        ids$,
        settings$,
        tickets$,
        notes$,
        agendas$,
        habits$,
        clocks$,
        waves$,
        bookmarks$,
        paintings$,
        pens$,
        voices$,
        drums$,
        linked$,
        focusLinks$,
        library$,
        blueprints$,
        edits$,
        palettes$,
        look$,
        looks$,
        appearance$,
    };
};

export type Projections = ReturnType<typeof projectionsOf>;
