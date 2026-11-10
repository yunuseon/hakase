import { combineLatest, EMPTY, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    map,
    mergeMap,
    scan,
    shareReplay,
    startWith,
    switchMap,
} from 'rxjs/operators';
import { emptyAgenda } from '../components/agenda/agenda.ts';
import { defaultBookmarks } from '../components/bookmarks/bookmarks.ts';
import { defaultClocks } from '../components/clocks/clocks.ts';
import { defaultDrums, kitCurve, kitOf, sameKit } from '../components/drums/drums.ts';
import { initialFocus } from '../components/focus/focus.ts';
import { emptyHabits } from '../components/habits/habits.ts';
import { emptyNotes } from '../components/note/note.ts';
import { defaultPen, drawingOf, sameDrawing, strokeOf } from '../components/pen/pen.ts';
import type { Reading } from '../components/progress-bar/progress-bar.ts';
import { themes, type ThemeName } from '../components/sketch/themes/registry.ts';
import { defaultVoice, sameSounding, soundingOf, voiceCurve } from '../components/voice/voice.ts';
import {
    followedBy,
    progressBinding,
    readingOf,
    SOURCES,
    type Bindings,
    type PlaybackBinding,
} from '../inputs.ts';
import { ownerOf } from '../documents.ts';
import { sourceIn } from '../input-connections.ts';
import { parseTarget, type Global } from '../inventory.ts';
import { wallClock$ } from '../lib/rx.ts';
import { sourceOf, type FormulaId } from '../library.ts';
import type { AppSignal } from '../process.ts';
import type { AppState, ProgramId, Task } from '../program.ts';
import { inputsFor, programOf } from '../programs.ts';
import type { Driver } from '../shared/curve.ts';
import { defaultPicture } from '../shared/picture.ts';
import { defaultSignal, sameWave, waveOf } from '../shared/signal.ts';
import { defaultTickets } from '../shared/tickets.ts';
import { graphOf, sameGraph } from '../state-graph.ts';
import { colourOf, inStore, type StoreId } from '../stores.ts';
import { entriesOf } from '../timeline.ts';
import { listed } from '../workspace.ts';
import type { Projections } from './projections.graph.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

type StoreKey =
    | 'progress$'
    | 'playhead$'
    | 'reading$'
    | 'plan$'
    | 'playing$'
    | 'looping$'
    | 'duration$'
    | 'clock$'
    | 'tickets$'
    | 'notes$'
    | 'focus$'
    | 'agenda$'
    | 'habits$'
    | 'clocks$'
    | 'bookmarks$'
    | 'signal$'
    | 'wave$'
    | 'linkedDriver$'
    | 'followedSignal$'
    | 'picture$'
    | 'linkedPicture$'
    | 'drawing$'
    | 'sounding$'
    | 'kit$';

type Reads = Omit<Projections, 'ids$' | 'focusLinks$' | 'sketchLinks$'> &
    Pick<Timekeeping, 'timers$' | 'planIn' | 'playbackIn'> & {
        readonly inputs$: Observable<AppSignal>;
    };

export const scopedOf = ({
    history$,
    documents$,
    workspace$,
    camera$,
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
    library$,
    blueprints$,
    edits$,
    palettes$,
    look$,
    looks$,
    appearance$,
    timers$,
    planIn,
    playbackIn,
    inputs$,
}: Reads) => {
    const diagnostics$ = inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'diagnostic' ? of(input) : EMPTY)),
        scan(
            (all, { formula, message }) => new Map(all).set(formula, message),
            new Map<FormulaId, string | null>(),
        ),
        startWith(new Map<FormulaId, string | null>()),
        // Same: an editor switching formula drops the only subscriber for a moment.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    // Which stores hold any data, read as one sorted key so a ticking timer does not churn the graph.
    const held$: Observable<ReadonlySet<StoreId>> = combineLatest([
        tickets$,
        notes$,
        timers$,
        agendas$,
        habits$,
        clocks$,
        bookmarks$,
        waves$,
        paintings$,
        pens$,
        voices$,
        drums$,
    ]).pipe(
        map(all => [...new Set(all.flatMap(stores => [...stores.keys()]))].sort().join('\n')),
        distinctUntilChanged(),
        map(key => new Set(key === '' ? [] : key.split('\n'))),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const state: Omit<AppState, StoreKey> = {
        zoom$: camera$.pipe(
            map(({ zoom }) => zoom),
            distinctUntilChanged(),
        ),
        source$: (formula: FormulaId) =>
            combineLatest([edits$, library$]).pipe(
                map(
                    ([edits, library]) =>
                        edits.get(formula) ?? { value: sourceOf(formula, library), from: null },
                ),
            ),
        theme$: (theme: ThemeName) =>
            palettes$.pipe(map(all => all.get(theme) ?? { value: themes[theme], from: null })),
        look$,
        appearance$,
        library$,
        blueprints$,
        inspect$: (id: string) => inspected$(id),
        graph$: combineLatest([workspace$, held$, linked$]).pipe(
            map(([workspace, held, signals]) =>
                graphOf(workspace, inputsFor, programOf, held, signals),
            ),
            distinctUntilChanged(sameGraph),
        ),
        history$: history$.pipe(map(entriesOf)),
        tasks$: workspace$.pipe(
            map(({ processes }) =>
                listed(processes).flatMap(({ process, ordinal, focused }): Task[] => {
                    const program = programOf(process.program);

                    return program === undefined
                        ? []
                        : [
                              {
                                  id: process.id,
                                  title: program.title,
                                  icon: program.icon,
                                  ordinal,
                                  focused,
                              },
                          ];
                }),
            ),
        ),
        error$: (formula: FormulaId) =>
            diagnostics$.pipe(
                map(all => all.get(formula) ?? null),
                distinctUntilChanged(),
            ),
    };

    const ticketsIn = inStore(tickets$, defaultTickets);
    const notesIn = inStore(notes$, emptyNotes);
    const agendaIn = inStore(agendas$, emptyAgenda);
    const habitsIn = inStore(habits$, emptyHabits);
    const clocksIn = inStore(clocks$, defaultClocks);
    const bookmarksIn = inStore(bookmarks$, defaultBookmarks);
    const signalIn = inStore(waves$, defaultSignal);
    const waveIn = (store: StoreId) =>
        waves$.pipe(
            map(all => waveOf(all, store)),
            distinctUntilChanged(sameWave),
        );
    const timerIn = inStore(timers$, initialFocus);
    const pictureIn = inStore(paintings$, defaultPicture);
    const drawingIn = (store: StoreId) =>
        documents$.pipe(
            map(({ pens, signals }) => drawingOf(pens.get(store) ?? defaultPen, signals)),
            distinctUntilChanged(sameDrawing),
        );

    const soundingIn = (store: StoreId) =>
        documents$.pipe(
            map(({ voices, signals }) => soundingOf(voices.get(store) ?? defaultVoice, signals)),
            distinctUntilChanged(sameSounding),
        );

    const kitIn = (store: StoreId) =>
        documents$.pipe(
            map(({ drums, signals }) => kitOf(drums.get(store) ?? defaultDrums, signals)),
            distinctUntilChanged(sameKit),
        );

    const documentIn: Readonly<
        Partial<Record<ProgramId, (store: StoreId) => Observable<unknown>>>
    > = {
        tickets: ticketsIn,
        note: notesIn,
        focus: timerIn,
        agenda: agendaIn,
        habits: habitsIn,
        clocks: clocksIn,
        bookmarks: bookmarksIn,
        signal: signalIn,
        paint: pictureIn,
        pen: drawingIn,
        voice: soundingIn,
        drums: kitIn,
        timeline: playbackIn,
    };

    const globalOf = (name: Global): Observable<unknown> => {
        switch (name) {
            case 'workspace':
                return workspace$;
            case 'appearance':
                return combineLatest({ look: look$, edits: looks$ });
            case 'formulas':
                return edits$;
            case 'themes':
                return palettes$;
            case 'library':
                return library$;
        }
    };

    const inspected$ = (id: string): Observable<unknown> => {
        const target = parseTarget(id);

        if (target === null) {
            return of(null);
        }

        if (target.kind === 'global') {
            return globalOf(target.name);
        }

        const select = documentIn[target.program];

        return select !== undefined
            ? select(target.store)
            : settings$.pipe(map(all => all.get(target.store) ?? null));
    };

    // A program reads its own state already narrowed to its window's store, so it never learns stores exist.
    const sources = {
        focus$: timerIn,
        plan$: planIn,
        agenda$: agendaIn,
        tickets$: ticketsIn,
        now$: wallClock$,
    };

    return (
        store$: Observable<StoreId>,
        clock$: Observable<PlaybackBinding | null>,
        follows$: Observable<Bindings>,
    ): AppState => {
        const followed$ = (input: string) =>
            follows$.pipe(
                map(follows => followedBy(follows, input)),
                distinctUntilChanged((a, b) => a?.kind === b?.kind && a?.store === b?.store),
            );
        const narrowed = <T>(select: (store: StoreId) => Observable<T>): Observable<T> =>
            store$.pipe(switchMap(select));
        // A store input of this window's store, read as the binding a window's own follow would be.
        const linkedBy$ = (param: string) =>
            store$.pipe(
                switchMap(store =>
                    combineLatest([linked$, workspace$]).pipe(
                        map(([linked, workspace]) => {
                            const source = sourceIn(linked, store, param);
                            const owner = source === null ? null : ownerOf(workspace, source);
                            const kind = SOURCES.find(({ program }) => program === owner)?.kind;

                            return source === null || kind === undefined
                                ? null
                                : progressBinding(kind, source);
                        }),
                        distinctUntilChanged(
                            (a, b) => a?.kind === b?.kind && a?.store === b?.store,
                        ),
                    ),
                ),
            );
        const clock = clock$.pipe(
            switchMap(binding => (binding === null ? EMPTY : playbackIn(binding.store))),
            shareReplay({ bufferSize: 1, refCount: true }),
        );

        // The follower's own loop: a voice's envelope is in seconds, and a window on another clock plays it on its own time.
        const seconds$ = clock.pipe(
            map(({ duration }) => duration),
            distinctUntilChanged(),
        );

        return {
            ...state,
            reading$: followed$('source').pipe(
                switchMap(
                    (binding): Observable<Reading> =>
                        (binding === null ? null : readingOf(binding, sources)) ??
                        of({ kind: 'none', title: 'Nothing followed' }),
                ),
                shareReplay({ bufferSize: 1, refCount: true }),
            ),
            playhead$: clock.pipe(
                map(({ at }) => at),
                distinctUntilChanged(),
            ),
            playing$: clock.pipe(
                map(({ playing }) => playing),
                distinctUntilChanged(),
            ),
            looping$: clock.pipe(
                map(({ looping }) => looping),
                distinctUntilChanged(),
            ),
            clock$: clock,
            duration$: clock.pipe(
                map(({ duration }) => duration),
                distinctUntilChanged(),
            ),
            tickets$: narrowed(ticketsIn),
            notes$: narrowed(notesIn),
            focus$: narrowed(timerIn),
            plan$: narrowed(planIn),
            agenda$: narrowed(agendaIn),
            habits$: narrowed(habitsIn),
            clocks$: narrowed(clocksIn),
            bookmarks$: narrowed(bookmarksIn),
            signal$: narrowed(signalIn),
            wave$: narrowed(waveIn),
            linkedDriver$: param =>
                linkedBy$(param).pipe(
                    switchMap((binding): Observable<Driver | null> =>
                        binding?.kind === 'signal'
                            ? waveIn(binding.store)
                            : binding?.kind === 'voice'
                              ? combineLatest([soundingIn(binding.store), seconds$]).pipe(
                                    map(([sounding, seconds]) => voiceCurve(sounding, seconds)),
                                )
                              : binding?.kind === 'drums'
                                ? combineLatest([kitIn(binding.store), seconds$]).pipe(
                                      map(([kit, seconds]) => kitCurve(kit, seconds)),
                                  )
                                : of(null),
                    ),
                ),
            picture$: narrowed(pictureIn),
            drawing$: narrowed(drawingIn),
            sounding$: narrowed(soundingIn),
            kit$: narrowed(kitIn),
            linkedPicture$: param =>
                linkedBy$(param).pipe(
                    switchMap(binding =>
                        binding?.kind === 'paint'
                            ? pictureIn(binding.store)
                            : binding?.kind === 'pen'
                              ? drawingIn(binding.store).pipe(map(strokeOf))
                              : of(null),
                    ),
                ),
            followedSignal$: input =>
                followed$(input).pipe(
                    switchMap(binding =>
                        binding?.kind !== 'signal'
                            ? of(null)
                            : documents$.pipe(
                                  map(({ workspace, signals }) => ({
                                      id: binding.store,
                                      name:
                                          workspace.stores.find(({ id }) => id === binding.store)
                                              ?.name ?? 'Main',
                                      colour: colourOf(binding.store),
                                      wave: waveOf(signals, binding.store),
                                  })),
                                  distinctUntilChanged(
                                      (a, b) => a.name === b.name && sameWave(a.wave, b.wave),
                                  ),
                              ),
                    ),
                ),
        };
    };
};

export type Scoped = ReturnType<typeof scopedOf>;
