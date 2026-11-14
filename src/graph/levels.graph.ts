import { combineLatest, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay, switchMap } from 'rxjs/operators';
import { emptyAgenda } from '../components/agenda/agenda.ts';
import { cityOf, defaultClocks, offsetMinutes } from '../components/clocks/clocks.ts';
import {
    defaultDrums,
    drumCurve,
    isDrum,
    kitCurve,
    sameKit,
    type Kit,
} from '../components/drums/drums.ts';
import { focusView, initialFocus } from '../components/focus/focus.ts';
import { emptyHabits } from '../components/habits/habits.ts';
import { defaultPen, sameDrawing, strokeOf, type Drawing } from '../components/pen/pen.ts';
import {
    defaultVoice,
    pitchCurve,
    sameSounding,
    voiceCurve,
    type Sounding,
} from '../components/voice/voice.ts';
import { bitCurve, circuitTable, type Table } from '../circuit.ts';
import {
    bitShaped,
    clockBit,
    clockLevel,
    CONVERTER_DEFAULTS,
    CONVERTERS,
    doneLevel,
    habitsBit,
    habitsLevel,
    isConverterKind,
    phaseLevel,
    shaped,
    soundBits,
    tasksBit,
    thresholded,
    timerBit,
    pictureCurve,
    timingCurve,
    zoneCurve,
    type Conversion,
    type Converter,
    type ConverterItem,
    type ConverterKind,
} from '../converters.ts';
import { ownerOf } from '../documents.ts';
import { GATE_DEFAULTS, GATES, isGateKind, sourceOfGate, type Gate } from '../gates.ts';
import { sourceIn } from '../input-connections.ts';
import { isImageKind, progressBinding, SOURCES, type Follow } from '../inputs.ts';
import type { PictureFrames } from '../engine/levels.ts';
import { NONE, sameImage, type Image } from '../image.ts';
import { sourceOf } from '../library.ts';
import { defaultPedal, isPedalKind, PEDALS, type Pedal, type PedalKind } from '../pedals.ts';
import { asSketch } from '../settings.ts';
import { defaultPicture } from '../shared/picture.ts';
import { samePanel, type Drive } from '../components/sketch/params.ts';
import { sameOrbit } from '../components/sketch/space.ts';
import { isThemeName, themes } from '../components/sketch/themes/registry.ts';
import { dayOf } from '../lib/day.ts';
import { wallClock$ } from '../lib/rx.ts';
import { curveOf, type Driver } from '../shared/curve.ts';
import { secondsOf } from '../shared/playhead.ts';
import {
    defaultSignal,
    driverAt,
    sameDriver,
    sameWave,
    TIME,
    type Wave,
} from '../shared/signal.ts';
import { defaultTickets } from '../shared/tickets.ts';
import { inStore, type StoreId } from '../stores.ts';
import type { Projections } from './projections.graph.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

export type Pace = { readonly seconds: number; readonly ticks: number };

type Seen = ReadonlySet<StoreId>;

export const NONE_SEEN: Seen = new Set();

// One object per kind, not one per read: a fresh default each time would look like an edit to every stage.
const PEDAL_DEFAULTS: Readonly<Record<PedalKind, Pedal>> = {
    colourmap: defaultPedal('colourmap'),
    kaleido: defaultPedal('kaleido'),
    feedback: defaultPedal('feedback'),
    mix: defaultPedal('mix'),
    blur: defaultPedal('blur'),
};

type Reads = Pick<
    Projections,
    | 'stores$'
    | 'tickets$'
    | 'agendas$'
    | 'habits$'
    | 'clocks$'
    | 'waves$'
    | 'pens$'
    | 'voices$'
    | 'drums$'
    | 'gates$'
    | 'converters$'
    | 'linked$'
    | 'pedals$'
    | 'paintings$'
    | 'settings$'
    | 'edits$'
    | 'library$'
    | 'palettes$'
> &
    Pick<Timekeeping, 'timers$' | 'planIn' | 'playbackIn'> & {
        readonly pictureFrames$: PictureFrames;
    };

export const levelsOf = ({
    stores$,
    tickets$,
    agendas$,
    habits$,
    clocks$,
    waves$,
    pens$,
    voices$,
    drums$,
    gates$,
    converters$,
    linked$,
    pedals$,
    paintings$,
    settings$,
    edits$,
    library$,
    palettes$,
    timers$,
    planIn,
    playbackIn,
    pictureFrames$,
}: Reads) => {
    const ticketsIn = inStore(tickets$, defaultTickets);
    const agendaIn = inStore(agendas$, emptyAgenda);
    const habitsIn = inStore(habits$, emptyHabits);
    const clocksIn = inStore(clocks$, defaultClocks);
    const signalIn = inStore(waves$, defaultSignal);
    const penIn = inStore(pens$, defaultPen);
    const voiceIn = inStore(voices$, defaultVoice);
    const drumsIn = inStore(drums$, defaultDrums);
    const waveIn = (store: StoreId, pace$: Observable<Pace>, seen: Seen = NONE_SEEN) =>
        combineLatest({
            signal: signalIn(store),
            phase: drivenIn(store, 'phase', pace$, seen),
            offset: drivenIn(store, 'offset', pace$, seen),
            depth: drivenIn(store, 'depth', pace$, seen),
        }).pipe(
            map(({ signal, phase, offset, depth }): Wave => ({
                signal,
                mods: { phase, offset, depth },
            })),
            distinctUntilChanged(sameWave),
        );
    const timerIn = inStore(timers$, initialFocus);
    const drawingIn = (store: StoreId, pace$: Observable<Pace>, seen: Seen = NONE_SEEN) =>
        combineLatest({
            pen: penIn(store),
            x: drivenIn(store, 'x', pace$, seen),
            y: drivenIn(store, 'y', pace$, seen),
            size: drivenIn(store, 'size', pace$, seen),
            ink: drivenIn(store, 'ink', pace$, seen),
        }).pipe(
            map(({ pen, ...waves }): Drawing => ({ pen, waves })),
            distinctUntilChanged(sameDrawing),
        );

    const soundingIn = (store: StoreId, pace$: Observable<Pace>, seen: Seen = NONE_SEEN) =>
        combineLatest({
            voice: voiceIn(store),
            pitch: drivenIn(store, 'pitch', pace$, seen),
            volume: drivenIn(store, 'volume', pace$, seen),
            filter: drivenIn(store, 'filter', pace$, seen),
            pan: drivenIn(store, 'pan', pace$, seen),
        }).pipe(
            map(({ voice, ...waves }): Sounding => ({ voice, waves })),
            distinctUntilChanged(sameSounding),
        );

    const kitIn = (store: StoreId, pace$: Observable<Pace>, seen: Seen = NONE_SEEN) =>
        combineLatest({
            drums: drumsIn(store),
            volume: drivenIn(store, 'volume', pace$, seen),
        }).pipe(
            map(({ drums, volume }): Kit => ({ drums, volume })),
            distinctUntilChanged(sameKit),
        );

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

    const loudnessIn = (
        binding: Follow,
        pace$: Observable<Pace>,
        seen: Seen,
    ): Observable<Driver | null> =>
        binding.kind === 'voice'
            ? combineLatest([soundingIn(binding.store, pace$, seen), pace$]).pipe(
                  map(([sounding, { seconds }]) => voiceCurve(sounding, seconds)),
              )
            : binding.kind === 'drums'
              ? combineLatest([kitIn(binding.store, pace$, seen), pace$]).pipe(
                    map(([kit, { seconds }]) => kitCurve(kit, seconds)),
                )
              : of(null);

    const readingIn = (
        store: StoreId,
        { kind, choice, bits }: Converter,
        pace$: Observable<Pace>,
        seen: Seen,
    ): Observable<Driver | null> =>
        linkIn(store, 'in').pipe(
            switchMap((binding): Observable<Driver | null> => {
                if (binding === null || seen.has(binding.store)) {
                    return of(null);
                }

                const below = new Set([...seen, store]);

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
                                ? soundingIn(binding.store, pace$, below).pipe(map(pitchCurve))
                                : choice === 'loudness'
                                  ? combineLatest([
                                        soundingIn(binding.store, pace$, below),
                                        pace$,
                                    ]).pipe(
                                        map(([sounding, { seconds }]) =>
                                            voiceCurve(sounding, seconds),
                                        ),
                                    )
                                  : of(null)
                            : binding.kind === 'drums'
                              ? choice === 'pitch'
                                  ? of(curveOf(() => 0))
                                  : combineLatest([kitIn(binding.store, pace$, below), pace$]).pipe(
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
                        return boundIn(binding, pace$, below);
                    case 'level-bit':
                        return boundIn(binding, pace$, below).pipe(
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
                        return loudnessIn(binding, pace$, below).pipe(
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
                    case 'picture-level':
                        return isImageKind(binding.kind)
                            ? pictureFrames$(
                                  imageIn(binding.store, pace$, below),
                                  pace$.pipe(
                                      map(({ seconds }) => seconds),
                                      distinctUntilChanged(),
                                  ),
                              ).pipe(
                                  map(frames =>
                                      frames === null ? null : pictureCurve(frames, choice),
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
    const conversionIn = (
        store: StoreId,
        pace$: Observable<Pace>,
        seen: Seen = NONE_SEEN,
    ): Observable<Conversion> =>
        converterIn(store).pipe(
            switchMap(converter =>
                (PICKED.includes(converter.kind)
                    ? pickedIn(store, converter)
                    : readingIn(store, converter, pace$, seen).pipe(
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

    const driverOf = (
        binding: Follow,
        pace$: Observable<Pace>,
        seen: Seen,
    ): Observable<Driver | null> =>
        binding.kind === 'signal'
            ? waveIn(binding.store, pace$, seen)
            : isConverterKind(binding.kind)
              ? conversionIn(binding.store, pace$, seen).pipe(map(({ driver }) => driver))
              : isGateKind(binding.kind)
                ? pace$.pipe(
                      switchMap(({ ticks, seconds }) => tableOf(ticks, seconds)),
                      map(table => table.get(binding.store) ?? null),
                      distinctUntilChanged(),
                      map(row => (row === null ? null : bitCurve(row))),
                  )
                : of(null);

    const nowOn = (binding: Follow, clock: StoreId, seen: Seen): Observable<Driver | null> => {
        const clock$ = playbackIn(clock).pipe(shareReplay({ bufferSize: 1, refCount: true }));
        const pace$ = clock$.pipe(
            map((now): Pace => ({ seconds: secondsOf(now), ticks: now.ticks })),
            distinctUntilChanged((a, b) => a.seconds === b.seconds && a.ticks === b.ticks),
        );

        // Chained, not combined: the clock moves both the driver and the moment, and must not fire twice.
        return driverOf(binding, pace$, seen).pipe(
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

    const boundIn = (
        binding: Follow,
        pace$: Observable<Pace>,
        seen: Seen,
    ): Observable<Driver | null> =>
        seen.has(binding.store)
            ? of(null)
            : linkIn(binding.store, TIME).pipe(
                  switchMap(time =>
                      time?.kind === 'playback'
                          ? nowOn(binding, time.store, seen)
                          : driverOf(binding, pace$, seen),
                  ),
              );

    const drivenIn = (
        store: StoreId,
        param: string,
        pace$: Observable<Pace>,
        seen: Seen = NONE_SEEN,
    ): Observable<Driver | null> =>
        linkIn(store, param).pipe(
            switchMap(binding =>
                binding === null ? of(null) : boundIn(binding, pace$, new Set([...seen, store])),
            ),
            distinctUntilChanged(sameDriver),
        );

    const driverIn = (store: StoreId, param: string, pace$: Observable<Pace>) =>
        drivenIn(store, param, pace$);

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

    const pointsIn = (store: StoreId, pace$: Observable<Pace>, seen: Seen): Observable<Image> => {
        const sketch$ = settings$.pipe(
            map(all => asSketch(all.get(store))),
            distinctUntilChanged(),
        );
        const drive = (param: Drive) => drivenIn(store, param, pace$, seen);

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
        seen: Seen = NONE_SEEN,
    ): Observable<Image> =>
        seen.has(store)
            ? of(NONE)
            : stores$.pipe(
                  map(stores => ownerOf({ stores }, store)),
                  distinctUntilChanged(),
                  switchMap(owner =>
                      owner === 'sketch'
                          ? pointsIn(store, pace$, new Set([...seen, store]))
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

    return {
        pictureIn,
        pedalIn,
        sheetIn,
        imageIn,
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
    };
};

export type Levels = ReturnType<typeof levelsOf>;
