import { combineLatest, EMPTY, of, type Observable } from 'rxjs';
import { secondsOf } from '../shared/playhead.ts';
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
import { cityOf, defaultClocks, offsetMinutes } from '../components/clocks/clocks.ts';
import {
    defaultDrums,
    drumCurve,
    isDrum,
    kitCurve,
    kitOf,
    sameKit,
} from '../components/drums/drums.ts';
import { focusView, initialFocus } from '../components/focus/focus.ts';
import { emptyHabits } from '../components/habits/habits.ts';
import { emptyNotes } from '../components/note/note.ts';
import { defaultPen, drawingOf, sameDrawing, strokeOf } from '../components/pen/pen.ts';
import type { Reading } from '../components/progress-bar/progress-bar.ts';
import { themes, type ThemeName } from '../components/sketch/themes/registry.ts';
import {
    defaultVoice,
    pitchCurve,
    sameSounding,
    soundingOf,
    voiceCurve,
} from '../components/voice/voice.ts';
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
import { devicePixelRatio$, viewport$, wallClock$ } from '../lib/rx.ts';
import { previewSideOf } from '../engine/moment.ts';
import { sourceOf, type FormulaId } from '../library.ts';
import type { AppSignal } from '../process.ts';
import type { AppState, ProgramId, Task } from '../program.ts';
import { inputsFor, programOf } from '../programs.ts';
import { curveOf, driverAt, type Driver } from '../shared/curve.ts';
import { defaultPicture } from '../shared/picture.ts';
import { defaultSignal, sameWave, TIME, waveOf } from '../shared/signal.ts';
import { defaultTickets } from '../shared/tickets.ts';
import { graphOf, sameGraph } from '../state-graph.ts';
import { colourOf, inStore, type StoreId } from '../stores.ts';
import { isImageKind, type Follow } from '../inputs.ts';
import { GATE_DEFAULTS, GATES, isGateKind, sourceOfGate, type Gate } from '../gates.ts';
import {
    bitShaped,
    clockBit,
    clockLevel,
    CONVERTER_DEFAULTS,
    CONVERTERS,
    doneLevel,
    isConverterKind,
    phaseLevel,
    shaped,
    soundBits,
    tasksBit,
    thresholded,
    timerBit,
    timingCurve,
    habitsBit,
    habitsLevel,
    zoneCurve,
    type ConverterItem,
    type ConverterKind,
    type Conversion,
    type Converter,
} from '../converters.ts';
import { dayOf } from '../lib/day.ts';
import { boxReading, EMPTY_BOX } from '../boxes.ts';
import { bitCurve, circuitTable, type Table } from '../circuit.ts';

type Pace = { readonly seconds: number; readonly ticks: number };

const STILL: Pace = { seconds: 1, ticks: 1 };
import { defaultPedal, isPedalKind, PEDALS, type Pedal, type PedalKind } from '../pedals.ts';
import { isThemeName } from '../components/sketch/themes/registry.ts';
import { NONE, sameImage, type Image } from '../image.ts';
import { asSketch } from '../settings.ts';
import { samePanel, type Drive } from '../components/sketch/params.ts';
import { sameOrbit } from '../components/sketch/space.ts';
import { entriesOf } from '../timeline.ts';
import { listed } from '../workspace.ts';
import type { Projections } from './projections.graph.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

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
    | 'followedSignal$'
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
    };

export const scopedOf = ({
    history$,
    documents$,
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
    gates$,
    converters$,
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
        pen: drawingIn,
        voice: soundingIn,
        drums: kitIn,
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

    // Gates and the converter stores together, so the table never hears the registry by two paths.
    const circuitWiring$ = combineLatest([gates$, stores$]).pipe(
        map(([gates, stores]) => ({
            gates: new Map(
                stores.flatMap(({ id, program }): [StoreId, Gate][] =>
                    isGateKind(program) ? [[id, gates.get(id) ?? GATE_DEFAULTS[program]]] : [],
                ),
            ),
            converters: stores
                .filter(({ program }) => isConverterKind(program))
                .map(({ id }) => id)
                .join(' '),
        })),
        distinctUntilChanged(
            (a, b) =>
                a.converters === b.converters &&
                a.gates.size === b.gates.size &&
                [...a.gates].every(([id, gate]) => b.gates.get(id) === gate),
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const circuit$ = circuitWiring$.pipe(
        map(({ gates }) => gates),
        distinctUntilChanged(
            (a, b) => a.size === b.size && [...a].every(([id, gate]) => b.get(id) === gate),
        ),
    );

    const tables = new Map<string, Observable<Table>>();
    const tableOf = (ticks: number, seconds: number): Observable<Table> => {
        const key = `${ticks}:${seconds}`;
        const known = tables.get(key);

        if (known !== undefined) {
            return known;
        }

        const pace$ = of({ seconds, ticks });
        const found = (
            pairs: readonly Observable<readonly [StoreId, Driver | null]>[],
        ): Observable<ReadonlyMap<StoreId, Driver>> =>
            (pairs.length === 0 ? of([]) : combineLatest(pairs)).pipe(
                map(
                    all =>
                        new Map(
                            all.flatMap(([id, driver]): [StoreId, Driver][] =>
                                driver === null ? [] : [[id, driver]],
                            ),
                        ),
                ),
            );
        const made = circuitWiring$.pipe(
            switchMap(({ gates, converters: registered }) => {
                const compares = [...gates].flatMap(([id, gate]) =>
                    gate.kind === 'compare' ? [id] : [],
                );
                const converters = [
                    ...new Set(
                        [...gates.values()].flatMap(gate =>
                            GATES[gate.kind].bits.flatMap(param => {
                                const source = sourceOfGate(gate, param);

                                return source !== null && registered.split(' ').includes(source)
                                    ? [source]
                                    : [];
                            }),
                        ),
                    ),
                ];

                return combineLatest([
                    found(
                        compares.map(id =>
                            driverIn(id, 'in', pace$).pipe(map(driver => [id, driver] as const)),
                        ),
                    ),
                    found(
                        converters.map(id =>
                            conversionIn(id, pace$).pipe(
                                map(({ driver }) => [id, driver] as const),
                            ),
                        ),
                    ),
                ]).pipe(map(([drivers, outside]) => circuitTable(gates, ticks, drivers, outside)));
            }),
            shareReplay({ bufferSize: 1, refCount: true }),
        );
        tables.set(key, made);

        return made;
    };

    const converterIn = (store: StoreId) =>
        combineLatest([converters$, stores$]).pipe(
            map(([all, stores]) => {
                const owner = ownerOf({ stores }, store);

                return (
                    all.get(store) ??
                    (owner !== null && isConverterKind(owner)
                        ? CONVERTER_DEFAULTS[owner]
                        : CONVERTER_DEFAULTS['level-level'])
                );
            }),
            distinctUntilChanged(),
        );

    const today$ = wallClock$.pipe(
        map(dayOf),
        distinctUntilChanged(),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const nowAs = (level$: Observable<number>): Observable<Driver> =>
        level$.pipe(
            distinctUntilChanged(),
            map((level): Driver => ({ samples: Float32Array.of(level) })),
        );

    const loudnessIn = (binding: Follow, pace$: Observable<Pace>): Observable<Driver | null> =>
        binding.kind === 'voice'
            ? combineLatest([soundingIn(binding.store), pace$]).pipe(
                  map(([sounding, { seconds }]) => voiceCurve(sounding, seconds)),
              )
            : binding.kind === 'drums'
              ? combineLatest([kitIn(binding.store), pace$]).pipe(
                    map(([kit, { seconds }]) => kitCurve(kit, seconds)),
                )
              : of(null);

    const readingIn = (
        store: StoreId,
        { kind, choice, bits }: Converter,
        pace$: Observable<Pace>,
    ): Observable<Driver | null> =>
        linkIn(store, 'in').pipe(
            switchMap((binding): Observable<Driver | null> => {
                if (binding === null) {
                    return of(null);
                }

                switch (kind) {
                    case 'schedule-level':
                        return binding.kind === 'agenda'
                            ? combineLatest([agendaIn(binding.store), today$]).pipe(
                                  map(([agenda, day]) => timingCurve(agenda, day, choice)),
                              )
                            : of(null);
                    case 'sound-level':
                        return binding.kind === 'voice'
                            ? choice === 'pitch'
                                ? soundingIn(binding.store).pipe(map(pitchCurve))
                                : choice === 'loudness'
                                  ? combineLatest([soundingIn(binding.store), pace$]).pipe(
                                        map(([sounding, { seconds }]) =>
                                            voiceCurve(sounding, seconds),
                                        ),
                                    )
                                  : of(null)
                            : binding.kind === 'drums'
                              ? choice === 'pitch'
                                  ? of(curveOf(() => 0))
                                  : combineLatest([kitIn(binding.store), pace$]).pipe(
                                        map(([kit, { seconds }]) =>
                                            isDrum(choice)
                                                ? drumCurve(kit, choice, seconds)
                                                : kitCurve(kit, seconds),
                                        ),
                                    )
                              : of(null);
                    case 'timer-level':
                        return binding.kind === 'focus'
                            ? nowAs(
                                  combineLatest([
                                      timerIn(binding.store),
                                      planIn(binding.store),
                                  ]).pipe(
                                      map(([focus, plan]) =>
                                          phaseLevel(focusView(focus, plan), choice),
                                      ),
                                  ),
                              )
                            : of(null);
                    case 'tasks-level':
                        return binding.kind === 'tickets'
                            ? nowAs(
                                  ticketsIn(binding.store).pipe(
                                      map(tickets => doneLevel(tickets, choice)),
                                  ),
                              )
                            : of(null);
                    case 'level-level':
                        return driverOf(binding, pace$);
                    case 'level-bit':
                        return driverOf(binding, pace$).pipe(
                            map(driver =>
                                driver === null
                                    ? null
                                    : thresholded(
                                          driver,
                                          choice === 'below',
                                          bits.threshold,
                                          bits.band,
                                      ),
                            ),
                        );
                    case 'schedule-bit':
                        return binding.kind === 'agenda'
                            ? combineLatest([agendaIn(binding.store), today$]).pipe(
                                  map(([agenda, day]) =>
                                      thresholded(
                                          timingCurve(agenda, day, choice),
                                          false,
                                          0.001,
                                          0,
                                      ),
                                  ),
                              )
                            : of(null);
                    case 'timer-bit':
                        return binding.kind === 'focus'
                            ? nowAs(
                                  combineLatest([
                                      timerIn(binding.store),
                                      planIn(binding.store),
                                  ]).pipe(
                                      map(([focus, plan]) =>
                                          timerBit(focusView(focus, plan), choice),
                                      ),
                                  ),
                              )
                            : of(null);
                    case 'tasks-bit':
                        return binding.kind === 'tickets'
                            ? nowAs(
                                  ticketsIn(binding.store).pipe(
                                      map(tickets => tasksBit(tickets, choice)),
                                  ),
                              )
                            : of(null);
                    case 'sound-bit':
                        return loudnessIn(binding, pace$).pipe(
                            map(loudness =>
                                loudness === null ? null : soundBits(loudness, choice),
                            ),
                        );
                    case 'clock-level':
                    case 'clock-bit':
                        return binding.kind === 'playback'
                            ? nowAs(
                                  playbackIn(binding.store).pipe(
                                      map(clock =>
                                          kind === 'clock-bit'
                                              ? clockBit(clock, choice)
                                              : clockLevel(clock, choice),
                                      ),
                                  ),
                              )
                            : of(null);
                    case 'zones-level':
                    case 'zones-bit':
                    case 'habits-level':
                    case 'habits-bit':
                        return of(null);
                }
            }),
        );

    type Read = { readonly driver: Driver | null; readonly items: readonly ConverterItem[] };
    const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // The items a converter can pick between come from what it reads, so they arrive with its driver.
    const pickedIn = (store: StoreId, { kind, choice, item }: Converter): Observable<Read> =>
        linkIn(store, 'in').pipe(
            switchMap((binding): Observable<Read> => {
                if (binding?.kind === 'clocks') {
                    return combineLatest([clocksIn(binding.store), wallClock$]).pipe(
                        map(([{ zones }, now]) => {
                            const zone = zones.find(each => each === item) ?? zones[0];

                            return {
                                zone,
                                ahead:
                                    zone === undefined
                                        ? 0
                                        : offsetMinutes(now, zone) - offsetMinutes(now, LOCAL),
                                zones,
                            };
                        }),
                        distinctUntilChanged(
                            (a, b) =>
                                a.zone === b.zone && a.ahead === b.ahead && a.zones === b.zones,
                        ),
                        map(({ zone, ahead, zones }) => ({
                            driver: zone === undefined ? null : zoneCurve(ahead, choice),
                            items: zones.map(each => ({ id: each, title: cityOf(each) })),
                        })),
                    );
                }

                if (binding?.kind === 'habits') {
                    return combineLatest([habitsIn(binding.store), today$]).pipe(
                        map(([habits, today]) => {
                            const value =
                                kind === 'habits-bit'
                                    ? habitsBit(habits, item, today)
                                    : habitsLevel(habits, item, today, choice);

                            return {
                                value,
                                items: [
                                    { id: '', title: 'all habits' },
                                    ...habits.items.map(({ id, name }) => ({ id, title: name })),
                                ],
                            };
                        }),
                        distinctUntilChanged(
                            (a, b) =>
                                a.value === b.value &&
                                a.items.length === b.items.length &&
                                a.items.every(
                                    (each, index) =>
                                        each.id === b.items[index]?.id &&
                                        each.title === b.items[index]?.title,
                                ),
                        ),
                        map(({ value, items }) => ({
                            driver: { samples: Float32Array.of(value) },
                            items,
                        })),
                    );
                }

                return of({ driver: null, items: [] });
            }),
        );

    const PICKED: readonly ConverterKind[] = [
        'zones-level',
        'zones-bit',
        'habits-level',
        'habits-bit',
    ];

    // One stream for both: a window that combined the document with its driver would fire twice per edit.
    const conversionIn = (store: StoreId, pace$: Observable<Pace>): Observable<Conversion> =>
        converterIn(store).pipe(
            switchMap(converter =>
                (PICKED.includes(converter.kind)
                    ? pickedIn(store, converter)
                    : readingIn(store, converter, pace$).pipe(
                          map((driver): Read => ({ driver, items: [] })),
                      )
                ).pipe(
                    map(({ driver, items }) => ({
                        converter,
                        items,
                        driver:
                            driver === null
                                ? null
                                : CONVERTERS[converter.kind].makes === 'bit'
                                  ? bitShaped(driver, converter.bits)
                                  : shaped(driver, converter.shape),
                    })),
                ),
            ),
        );

    const gateIn = (store: StoreId) =>
        combineLatest([gates$, stores$]).pipe(
            map(([all, stores]) => {
                const owner = ownerOf({ stores }, store);

                return (
                    all.get(store) ??
                    (owner !== null && isGateKind(owner)
                        ? GATE_DEFAULTS[owner]
                        : GATE_DEFAULTS.lamp)
                );
            }),
            distinctUntilChanged(),
        );

    const linkIn = (store: StoreId, param: string) =>
        combineLatest([linked$, stores$]).pipe(
            map(([linked, stores]) => {
                const source = sourceIn(linked, store, param);
                const owner = source === null ? null : ownerOf({ stores }, source);
                const kind = SOURCES.find(({ program }) => program === owner)?.kind;

                return source === null || kind === undefined ? null : progressBinding(kind, source);
            }),
            distinctUntilChanged((a, b) => a?.kind === b?.kind && a?.store === b?.store),
        );

    const driverOf = (binding: Follow, pace$: Observable<Pace>): Observable<Driver | null> =>
        binding.kind === 'signal'
            ? waveIn(binding.store)
            : isConverterKind(binding.kind)
              ? conversionIn(binding.store, pace$).pipe(map(({ driver }) => driver))
              : isGateKind(binding.kind)
                ? pace$.pipe(
                      switchMap(({ ticks, seconds }) => tableOf(ticks, seconds)),
                      map(table => table.get(binding.store) ?? null),
                      distinctUntilChanged(),
                      map(row => (row === null ? null : bitCurve(row))),
                  )
                : of(null);

    const nowOn = (binding: Follow, clock: StoreId): Observable<Driver | null> => {
        const clock$ = playbackIn(clock).pipe(shareReplay({ bufferSize: 1, refCount: true }));
        const pace$ = clock$.pipe(
            map((now): Pace => ({ seconds: secondsOf(now), ticks: now.ticks })),
            distinctUntilChanged((a, b) => a.seconds === b.seconds && a.ticks === b.ticks),
        );

        // Chained, not combined: the clock moves both the driver and the moment, and must not fire twice.
        return driverOf(binding, pace$).pipe(
            switchMap(driver =>
                driver === null
                    ? of(null)
                    : clock$.pipe(
                          map(({ at }) => at),
                          distinctUntilChanged(),
                          map((at): Driver => ({ samples: Float32Array.of(driverAt(driver, at)) })),
                      ),
            ),
        );
    };

    const driverIn = (store: StoreId, param: string, pace$: Observable<Pace>) =>
        linkIn(store, param).pipe(
            switchMap(binding =>
                binding === null
                    ? of(null)
                    : linkIn(binding.store, TIME).pipe(
                          switchMap(time =>
                              time?.kind === 'playback'
                                  ? nowOn(binding, time.store)
                                  : driverOf(binding, pace$),
                          ),
                      ),
            ),
        );

    const sheetIn = (store: StoreId, param: string) =>
        linkIn(store, param).pipe(
            switchMap(binding =>
                binding?.kind === 'paint'
                    ? pictureIn(binding.store)
                    : binding?.kind === 'pen'
                      ? drawingIn(binding.store).pipe(map(strokeOf))
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
            sheet: sheetIn(store, 'paint'),
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
            wave$: narrowed(waveIn),
            linkedDriver$: param => store$.pipe(switchMap(store => driverIn(store, param, pace$))),
            picture$: narrowed(pictureIn),
            drawing$: narrowed(drawingIn),
            sounding$: narrowed(soundingIn),
            kit$: narrowed(kitIn),
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
            linkedPicture$: param => store$.pipe(switchMap(store => sheetIn(store, param))),
            followedImage$: input =>
                followed$(input).pipe(
                    switchMap(binding =>
                        binding !== null && isImageKind(binding.kind)
                            ? imageIn(binding.store, pace$)
                            : of(NONE),
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
