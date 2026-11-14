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
import { boxReading, EMPTY_BOX } from '../boxes.ts';
import { defaultBookmarks } from '../components/bookmarks/bookmarks.ts';
import { emptyNotes } from '../components/note/note.ts';
import { strokeOf } from '../components/pen/pen.ts';
import type { Reading } from '../components/progress-bar/progress-bar.ts';
import { samePanel, type Drive } from '../components/sketch/params.ts';
import { sameOrbit } from '../components/sketch/space.ts';
import { isThemeName, themes, type ThemeName } from '../components/sketch/themes/registry.ts';
import { ownerOf } from '../documents.ts';
import { previewSideOf } from '../engine/moment.ts';
import { NONE, sameImage, type Image } from '../image.ts';
import {
    followedBy,
    isImageKind,
    readingOf,
    type Bindings,
    type PlaybackBinding,
} from '../inputs.ts';
import { parseTarget, type Global } from '../inventory.ts';
import { devicePixelRatio$, viewport$, wallClock$ } from '../lib/rx.ts';
import { sourceOf, type FormulaId } from '../library.ts';
import { defaultPedal, isPedalKind, PEDALS, type Pedal, type PedalKind } from '../pedals.ts';
import type { AppSignal } from '../process.ts';
import type { AppState, ProgramId, Task } from '../program.ts';
import { inputsFor, programOf } from '../programs.ts';
import { asSketch } from '../settings.ts';
import { defaultPicture } from '../shared/picture.ts';
import { secondsOf } from '../shared/playhead.ts';
import { TIME } from '../shared/signal.ts';
import { graphOf, sameGraph } from '../state-graph.ts';
import { colourOf, inStore, MAIN, type StoreId } from '../stores.ts';
import { entriesOf } from '../timeline.ts';
import { listed } from '../workspace.ts';
import { NONE_SEEN, type Levels, type Pace } from './levels.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

const STILL: Pace = { seconds: 1, ticks: 1 };

// One object per kind, not one per read: a fresh default each time would look like an edit to every stage.
const PEDAL_DEFAULTS: Readonly<Record<PedalKind, Pedal>> = {
    colourmap: defaultPedal('colourmap'),
    kaleido: defaultPedal('kaleido'),
    feedback: defaultPedal('feedback'),
    mix: defaultPedal('mix'),
    blur: defaultPedal('blur'),
};

type StoreKey =
    | 'progress$'
    | 'playhead$'
    | 'reading$'
    | 'plan$'
    | 'playing$'
    | 'looping$'
    | 'duration$'
    | 'ticks$'
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
    | 'followedLevel$'
    | 'picture$'
    | 'linkedPicture$'
    | 'followedImage$'
    | 'drawing$'
    | 'sounding$'
    | 'kit$'
    | 'pedal$'
    | 'gate$'
    | 'conversion$'
    | 'bits$'
    | 'box$'
    | 'image$'
    | 'linkedName$';

type Reads = Omit<Projections, 'ids$' | 'focusLinks$' | 'sketchLinks$'> &
    Pick<Timekeeping, 'timers$' | 'planIn' | 'playbackIn'> & {
        readonly inputs$: Observable<AppSignal>;
    } & Levels;

export const scopedOf = ({
    history$,
    workspace$,
    stores$,
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
    pedals$,
    boxes$,
    linked$,
    library$,
    blueprints$,
    edits$,
    palettes$,
    look$,
    aspect$,
    looks$,
    appearance$,
    timers$,
    planIn,
    playbackIn,
    inputs$,
    ticketsIn,
    agendaIn,
    habitsIn,
    clocksIn,
    signalIn,
    penIn,
    voiceIn,
    drumsIn,
    timerIn,
    waveIn,
    drawingIn,
    soundingIn,
    kitIn,
    circuit$,
    tableOf,
    conversionIn,
    gateIn,
    linkIn,
    boundIn,
    driverIn,
}: Reads) => {
    const previewSide$ = combineLatest([workspace$, viewport$, devicePixelRatio$]).pipe(
        map(([workspace, viewport, ratio]) => previewSideOf(workspace, viewport, ratio)),
        distinctUntilChanged(),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
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
        pedals$,
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
        aspect$,
        previewSide$,
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
            map(({ processes }) => processes),
            distinctUntilChanged(
                (a, b) =>
                    a.length === b.length &&
                    a.every((process, index) => process.id === b[index]?.id),
            ),
            map(processes =>
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

    const notesIn = inStore(notes$, emptyNotes);
    const bookmarksIn = inStore(bookmarks$, defaultBookmarks);
    const pictureIn = inStore(paintings$, defaultPicture);

    const pedalIn = (store: StoreId) =>
        combineLatest([pedals$, stores$]).pipe(
            map(([all, stores]) => {
                const owner = ownerOf({ stores }, store);

                return (
                    all.get(store) ??
                    (owner !== null && isPedalKind(owner)
                        ? PEDAL_DEFAULTS[owner]
                        : PEDAL_DEFAULTS.mix)
                );
            }),
            distinctUntilChanged(),
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
        pen: penIn,
        voice: voiceIn,
        drums: drumsIn,
        colourmap: pedalIn,
        kaleido: pedalIn,
        feedback: pedalIn,
        mix: pedalIn,
        blur: pedalIn,
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

    const sources = {
        focus$: timerIn,
        plan$: planIn,
        agenda$: agendaIn,
        tickets$: ticketsIn,
        now$: wallClock$,
    };

    const sheetIn = (store: StoreId, param: string, pace$: Observable<Pace>) =>
        linkIn(store, param).pipe(
            switchMap(binding =>
                binding?.kind === 'paint'
                    ? pictureIn(binding.store)
                    : binding?.kind === 'pen'
                      ? drawingIn(binding.store, pace$).pipe(map(strokeOf))
                      : of(null),
            ),
        );

    const pointsIn = (store: StoreId, pace$: Observable<Pace>): Observable<Image> => {
        const sketch$ = settings$.pipe(
            map(all => asSketch(all.get(store))),
            distinctUntilChanged(),
        );
        const drive = (param: Drive) => driverIn(store, param, pace$);

        return combineLatest({
            source: sketch$.pipe(
                map(({ formula }) => formula),
                distinctUntilChanged(),
                switchMap(formula =>
                    combineLatest([edits$, library$]).pipe(
                        map(
                            ([edits, library]) =>
                                edits.get(formula)?.value ?? sourceOf(formula, library),
                        ),
                    ),
                ),
                distinctUntilChanged(),
            ),
            panel: sketch$.pipe(
                map(({ panel }) => panel),
                distinctUntilChanged(samePanel),
            ),
            theme: sketch$.pipe(
                map(({ theme }) => theme),
                distinctUntilChanged(),
                switchMap(name => palettes$.pipe(map(all => all.get(name)?.value ?? themes[name]))),
                distinctUntilChanged(),
            ),
            orbit: sketch$.pipe(
                map(({ orbit }) => orbit),
                distinctUntilChanged(sameOrbit),
            ),
            drivers: combineLatest({
                k1: drive('k1'),
                k2: drive('k2'),
                k3: drive('k3'),
                k4: drive('k4'),
                turn: drive('turn'),
                pitch: drive('pitch'),
                distance: drive('distance'),
                focus: drive('focus'),
                colour: drive('colour'),
                size: drive('size'),
                depth: drive('depth'),
                trails: drive('trails'),
            }),
            sheet: sheetIn(store, 'paint', pace$),
        }).pipe(map((parts): Image => ({ kind: 'points', store, ...parts })));
    };

    const imageIn = (
        store: StoreId,
        pace$: Observable<Pace>,
        seen: ReadonlySet<StoreId> = new Set(),
    ): Observable<Image> =>
        seen.has(store)
            ? of(NONE)
            : stores$.pipe(
                  map(stores => ownerOf({ stores }, store)),
                  distinctUntilChanged(),
                  switchMap(owner =>
                      owner === 'sketch'
                          ? pointsIn(store, pace$)
                          : owner !== null && isPedalKind(owner)
                            ? stageIn(store, owner, pace$, new Set([...seen, store]))
                            : of(NONE),
                  ),
                  distinctUntilChanged(sameImage),
              );

    const stageIn = (
        store: StoreId,
        kind: PedalKind,
        pace$: Observable<Pace>,
        seen: ReadonlySet<StoreId>,
    ): Observable<Image> => {
        const pedal$ = pedalIn(store);

        return combineLatest({
            pedal: pedal$,
            theme:
                kind === 'colourmap'
                    ? pedal$.pipe(
                          map(({ choice }) => choice),
                          distinctUntilChanged(),
                          switchMap(name =>
                              isThemeName(name)
                                  ? palettes$.pipe(map(all => all.get(name)?.value ?? themes[name]))
                                  : of(themes.paper),
                          ),
                          distinctUntilChanged(),
                      )
                    : of(null),
            drivers: combineLatest(
                Object.fromEntries(
                    PEDALS[kind].knobs.map(({ name }) => [name, driverIn(store, name, pace$)]),
                ),
            ),
            inputs: combineLatest(
                PEDALS[kind].inputs.map(input =>
                    linkIn(store, input).pipe(
                        switchMap(binding =>
                            binding !== null && isImageKind(binding.kind)
                                ? imageIn(binding.store, pace$, seen)
                                : of(NONE),
                        ),
                    ),
                ),
            ),
        }).pipe(map((parts): Image => ({ kind: 'pedal', store, ...parts })));
    };

    return (
        store$: Observable<StoreId>,
        playback$: Observable<PlaybackBinding | null>,
        follows$: Observable<Bindings>,
        shown$: Observable<boolean> = of(true),
    ): AppState => {
        // A source read on a clock of its own is shown on it, or its window would mark a moment nobody reads.
        const clock$ = combineLatest([
            playback$,
            store$.pipe(switchMap(store => linkIn(store, TIME))),
        ]).pipe(
            map(([binding, time]) => (time?.kind === 'playback' ? time : binding)),
            distinctUntilChanged((a, b) => a?.store === b?.store),
            shareReplay({ bufferSize: 1, refCount: true }),
        );
        const followed$ = (input: string) =>
            follows$.pipe(
                map(follows => followedBy(follows, input)),
                distinctUntilChanged((a, b) => a?.kind === b?.kind && a?.store === b?.store),
            );
        const narrowed = <T>(select: (store: StoreId) => Observable<T>): Observable<T> =>
            store$.pipe(switchMap(select));
        const clock = combineLatest([clock$, shown$]).pipe(
            switchMap(([binding, shown]) =>
                binding === null || !shown ? EMPTY : playbackIn(binding.store),
            ),
            shareReplay({ bufferSize: 1, refCount: true }),
        );

        const pace$ = clock$.pipe(
            switchMap(binding =>
                binding === null
                    ? of(STILL)
                    : clock.pipe(
                          map((now): Pace => ({ seconds: secondsOf(now), ticks: now.ticks })),
                      ),
            ),
            distinctUntilChanged((a, b) => a.seconds === b.seconds && a.ticks === b.ticks),
            shareReplay({ bufferSize: 1, refCount: true }),
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
            playhead$: clock$.pipe(
                switchMap(binding => (binding === null ? of(0) : clock.pipe(map(({ at }) => at)))),
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
            ticks$: clock.pipe(
                map(({ ticks }) => ticks),
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
            wave$: store$.pipe(switchMap(store => waveIn(store, pace$))),
            linkedDriver$: param => store$.pipe(switchMap(store => driverIn(store, param, pace$))),
            picture$: narrowed(pictureIn),
            drawing$: store$.pipe(switchMap(store => drawingIn(store, pace$))),
            sounding$: store$.pipe(switchMap(store => soundingIn(store, pace$))),
            kit$: store$.pipe(switchMap(store => kitIn(store, pace$))),
            pedal$: narrowed(pedalIn),
            gate$: narrowed(gateIn),
            conversion$: store$.pipe(switchMap(store => conversionIn(store, pace$))),
            bits$: combineLatest([store$, pace$]).pipe(
                switchMap(([store, { ticks, seconds }]) =>
                    tableOf(ticks, seconds).pipe(
                        map(table => table.get(store) ?? new Uint8Array(ticks)),
                    ),
                ),
                distinctUntilChanged(),
            ),
            box$: combineLatest([store$, pace$]).pipe(
                switchMap(([store, { ticks, seconds }]) =>
                    combineLatest([
                        boxes$.pipe(
                            map(all => all.get(store) ?? EMPTY_BOX),
                            distinctUntilChanged(),
                        ),
                        circuit$,
                        tableOf(ticks, seconds),
                    ]).pipe(map(([box, gates, table]) => boxReading(box, gates, table, ticks))),
                ),
            ),
            image$: store$.pipe(switchMap(store => imageIn(store, pace$))),
            linkedName$: param =>
                store$.pipe(
                    switchMap(store => linkIn(store, param)),
                    switchMap(binding =>
                        binding === null
                            ? of(null)
                            : stores$.pipe(
                                  map(
                                      stores =>
                                          stores.find(({ id }) => id === binding.store)?.name ??
                                          binding.store,
                                  ),
                              ),
                    ),
                    distinctUntilChanged(),
                ),
            linkedPicture$: param => store$.pipe(switchMap(store => sheetIn(store, param, pace$))),
            followedImage$: input =>
                followed$(input).pipe(
                    switchMap(binding =>
                        binding !== null && isImageKind(binding.kind)
                            ? imageIn(binding.store, pace$)
                            : of(NONE),
                    ),
                ),
            followedLevel$: input =>
                followed$(input).pipe(
                    switchMap(binding =>
                        binding === null
                            ? of(null)
                            : combineLatest([
                                  stores$.pipe(
                                      map(
                                          stores =>
                                              stores.find(({ id }) => id === binding.store)?.name ??
                                              MAIN,
                                      ),
                                      distinctUntilChanged(),
                                  ),
                                  boundIn(binding, pace$, NONE_SEEN),
                              ]).pipe(
                                  map(([name, driver]) =>
                                      driver === null
                                          ? null
                                          : {
                                                id: binding.store,
                                                name,
                                                colour: colourOf(binding.store),
                                                driver,
                                            },
                                  ),
                              ),
                    ),
                ),
        };
    };
};

export type Scoped = ReturnType<typeof scopedOf>;
