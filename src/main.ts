import {
    animationFrames,
    combineLatest,
    defer,
    EMPTY,
    from,
    merge,
    of,
    type Observable,
} from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    takeUntil,
    takeWhile,
    withLatestFrom,
} from 'rxjs/operators';
import './styles.css';
import { variables, type Appearance } from './appearance.ts';
import { appearances, type AppearanceName } from './appearances.ts';
import { centredOn, centreOf, fitted, flight, IDENTITY, zoomLabel } from './shared/camera.ts';
import { HksCanvas } from './components/canvas/canvas.component.ts';
import { HksNavigator } from './components/navigator/navigator.component.ts';
import { minimapOf } from './components/navigator/navigator.ts';
import { HksSeams } from './components/seams/seams.component.ts';
import { HksStateWiring } from './components/state-wiring/state-wiring.component.ts';
import {
    defaultSession,
    reduceSession,
    modeOf,
    wiringOf,
    type ModeAction,
    type StateMode,
} from './state-mode.ts';
import {
    commandFor,
    sameWiring,
    type WiringView,
    type WiringCommand,
} from './components/state-wiring/wiring.ts';
import type { StateCommand } from './shared/connections.ts';
import { HksSections } from './components/sections/sections.component.ts';
import { HksPalette } from './components/palette/palette.component.ts';
import { HksPlacement } from './components/placement/placement.component.ts';
import { footprintAt, ghostOf, idle, reducePlacing, type PlacingAction } from './placing.ts';
import { commandsOf, pickedAction, pickedOf, steppedSection } from './commands.ts';
import type { SectionView } from './components/sections/sections.ts';
import { HksToolbar, type ToolbarCategory } from './components/toolbar/toolbar.component.ts';
import type { ToolbarView } from './components/toolbar/toolbar.ts';
import { sourceOf, type FormulaId } from './library.ts';
import { sharedFormulas$ } from './share.ts';
import { createTimers$, initialFocus, restedTimers } from './components/focus/focus.ts';
import { defaultBookmarks } from './components/bookmarks/bookmarks.ts';
import { defaultSignal, reachedFrom, sameWave, waveOf, type Linked } from './shared/signal.ts';
import { inputGroups } from './input-connections.ts';
import { graphOf, sameGraph } from './state-graph.ts';
import { defaultBoard } from './components/board/board.ts';
import { defaultClocks } from './components/clocks/clocks.ts';
import { emptyAgenda } from './components/agenda/agenda.ts';
import { emptyHabits } from './components/habits/habits.ts';
import { emptyNotes } from './components/note/note.ts';
import { emptyTodos } from './components/todo/todo.ts';
import {
    definitionOf,
    followedBy,
    type Bindings,
    followedStores,
    playbackBinding,
    progressConnection,
    type InputsFor,
    type ProgramInputs,
    type PlaybackBinding,
} from './inputs.ts';
import {
    colourOf,
    HOLDING,
    inStore,
    settingsKey,
    withMain,
    type StoreEvent,
    type StoreId,
} from './stores.ts';
import { routePlayback$ } from './playback-routing.ts';
import type { ProgressConnection } from './progress.ts';
import { chime$ } from './chime.ts';
import { themes, type ThemeName } from './components/sketch/themes/registry.ts';
import { viewportSize } from './lib/dom.ts';
import { viewport$ } from './lib/rx.ts';
import type {
    FollowGroup,
    StoreOption,
    SwitchGroup,
    SwitchItem,
} from './components/window/frame.ts';
import { parseTarget, type Global } from './inventory.ts';
import { liveProcess$, type ProcessSignal } from './process.ts';
import { programs } from './programs.ts';
import {
    isProgramId,
    type AppState,
    type ProcessId,
    type ProgramId,
    type Slot,
    type Task,
    type Written,
    CATEGORIES,
    restored,
    valuesOf,
} from './program.ts';
import { createClocks$, initialClock, restedClocks } from './shared/playhead.ts';
import { defaultPicture } from './shared/picture.ts';
import { defaultPen, drawingOf, sameDrawing, strokeOf } from './components/pen/pen.ts';
import { defaultVoice, sameSounding, soundingOf, voiceCurve } from './components/voice/voice.ts';
import { defaultDrums, kitCurve, kitOf, sameKit } from './components/drums/drums.ts';
import type { Driver } from './shared/curve.ts';
import {
    documentsKit,
    linkedOf,
    reduceHistory,
    seqFloor,
    type DocumentAction,
    type Documents,
    type History,
    type TimeCommand,
} from './documents.ts';
import { entriesOf, startTimeline } from './timeline.ts';
import { toolbarHost$ } from './toolbar-host.ts';
import { persistState$, restoreState } from './state-store.ts';
import {
    boxOf,
    defaultWorkspace,
    listed,
    seamsOf,
    sectionAction,
    type Process,
    usedStores,
    type Workspace,
    type WorkspaceAction,
} from './workspace.ts';
import { pieceOf } from './pieces.ts';

type Jump = { readonly kind: 'section' | 'window'; readonly id: string };

type StoreKey =
    | 'progress$'
    | 'playhead$'
    | 'playing$'
    | 'looping$'
    | 'duration$'
    | 'clock$'
    | 'todos$'
    | 'board$'
    | 'notes$'
    | 'focus$'
    | 'agenda$'
    | 'habits$'
    | 'clocks$'
    | 'bookmarks$'
    | 'signal$'
    | 'wave$'
    | 'followedDriver$'
    | 'followedSignal$'
    | 'picture$'
    | 'followedPicture$'
    | 'drawing$'
    | 'sounding$'
    | 'kit$';

// In toolbar order: a record keeps its keys in the order they were written.
const programList = Object.values(programs);

const programOf = (id: ProgramId) => programs[id];

// The programs declare what they read from others; the workspace asks through this, never the table itself.
const inputsFor: InputsFor = program => programs[program].inputs;

const categories: readonly ToolbarCategory[] = CATEGORIES.map(category => ({
    ...category,
    items: programList
        .filter(program => program.category === category.id)
        .map(({ id, title, icon }) => ({ id, title, icon })),
})).filter(({ items }) => items.length > 0);

const sameSlot = ({ frame: a, focused }: Slot, { frame: b, focused: other }: Slot): boolean =>
    focused === other &&
    a.x === b.x &&
    a.y === b.y &&
    a.z === b.z &&
    a.width === b.width &&
    a.height === b.height;

const sameOptions = (a: readonly StoreOption[] | null, b: readonly StoreOption[] | null): boolean =>
    a === b ||
    (a !== null &&
        b !== null &&
        a.length === b.length &&
        a.every((option, index) => {
            const other = b[index];

            return (
                other !== undefined &&
                option.id === other.id &&
                option.name === other.name &&
                option.users === other.users &&
                option.current === other.current
            );
        }));

const reduced = reduceHistory(documentsKit(inputsFor));

const sameIds = (a: readonly ProcessId[], b: readonly ProcessId[]): boolean =>
    a.length === b.length && a.every((id, index) => id === b[index]);

const bootstrap = () => {
    const canvas = new HksCanvas();
    document.body.append(canvas);

    const toolbar = new HksToolbar().categories(categories);
    toolbar.slot = 'chrome';
    canvas.append(toolbar);

    const navigator = new HksNavigator();
    navigator.slot = 'chrome';
    canvas.append(navigator);

    const seams = new HksSeams();
    canvas.append(seams);
    const wiring = new HksStateWiring();
    canvas.append(wiring);

    const sections = new HksSections();
    canvas.append(sections);

    const palette = new HksPalette();
    palette.slot = 'chrome';
    canvas.append(palette);

    const placement = new HksPlacement();
    placement.slot = 'chrome';
    canvas.append(placement);

    const picked$ = palette.picks$.pipe(
        mergeMap(id => {
            const picked = pickedOf(id);

            return picked === null ? EMPTY : of(picked);
        }),
        share(),
    );

    const paletteOpen$ = merge(
        palette.opens$.pipe(map(() => 'toggle' as const)),
        merge(palette.closes$, palette.picks$).pipe(map(() => 'close' as const)),
    ).pipe(
        scan((open, command) => (command === 'toggle' ? !open : false), false),
        startWith(false),
        distinctUntilChanged(),
    );

    const launches$ = merge(
        toolbar.launches$,
        picked$.pipe(mergeMap(picked => (picked.kind === 'launch' ? of(picked.program) : EMPTY))),
    ).pipe(
        mergeMap(id => {
            const program = isProgramId(id) ? programOf(id) : undefined;

            return program === undefined ? EMPTY : of(program);
        }),
        withLatestFrom(viewport$),
        map(([program, viewport]): WorkspaceAction => ({
            kind: 'launch',
            program: program.id,
            size: program.size,
            viewport,
        })),
    );

    const zoomSteps$ = merge(navigator.zooms$, canvas.keys$).pipe(
        withLatestFrom(viewport$),
        map(([command, viewport]): WorkspaceAction => ({ kind: 'zoom-step', command, viewport })),
    );

    const toolbarActions$ = merge(
        seams.toggles$.pipe(map(({ a, b }): WorkspaceAction => ({ kind: 'toggle-link', a, b }))),
        toolbar.placements$.pipe(
            map((placement): WorkspaceAction => ({ kind: 'place-toolbar', placement })),
        ),
        toolbar.retracts$.pipe(map((): WorkspaceAction => ({ kind: 'retract-toolbar' }))),
        navigator.toggles$.pipe(map((): WorkspaceAction => ({ kind: 'toggle-minimap' }))),
        navigator.adds$.pipe(
            withLatestFrom(viewport$),
            map(([, viewport]): WorkspaceAction => ({ kind: 'add-section', viewport })),
        ),
        sections.gestures$.pipe(
            mergeMap(gesture => (gesture.kind === 'save' ? [] : [sectionAction(gesture)])),
        ),
        picked$.pipe(
            withLatestFrom(viewport$),
            mergeMap(([picked, viewport]) => {
                const action = pickedAction(picked, viewport);

                return action === null ? EMPTY : of(action);
            }),
        ),
        // defer: a flight starts from the camera this very fold holds.
        defer(() => flights$),
        defer(() => located$).pipe(map((id): WorkspaceAction => ({ kind: 'raise', id }))),
        // defer: the toolbar's window is opened from the state this very fold produces.
        defer(() => toolbarGestures$).pipe(
            map((gesture): WorkspaceAction => ({ kind: 'toolbar-window', gesture })),
        ),
    );

    const stored = restoreState(inputsFor);
    const started: Documents = {
        workspace: stored.workspace ?? defaultWorkspace(viewportSize(), inputsFor),
        settings: stored.settings,
        todos: stored.todos,
        boards: stored.board,
        notes: stored.notes,
        agendas: stored.agenda,
        habits: stored.habits,
        clocks: stored.clocks,
        bookmarks: stored.bookmarks,
        signals: stored.signals,
        paintings: stored.paint,
        pens: stored.pens,
        voices: stored.voices,
        drums: stored.drums,
        library: stored.library,
        pieces: stored.pieces,
        formulas: restored(stored.formulas),
        themes: restored(stored.themes),
        looks: restored(stored.looks),
        look: stored.look,
    };
    const begun: History = startTimeline(started, Math.max(stored.seq, seqFloor(started)));

    // defer, or the cycle is evaluated at construction: signals$ is built from this.
    const workspaceActions$ = merge(
        launches$,
        zoomSteps$,
        canvas.gestures$,
        merge(canvas.edits$, navigator.edits$).pipe(map((kind): WorkspaceAction => ({ kind }))),
        toolbarActions$,
        defer(() => signals$).pipe(
            mergeMap(signal => (signal.to === 'workspace' ? of(signal.action) : EMPTY)),
        ),
        defer(() => inputs$).pipe(
            mergeMap(({ input }) => (input.kind === 'task' ? of(input) : EMPTY)),
            withLatestFrom(viewport$),
            map(([{ command, id }, viewport]): WorkspaceAction =>
                command === 'close' ? { kind: 'quit', id } : { kind: 'reveal', id, viewport },
            ),
        ),
        merge(
            defer(() => inputs$).pipe(
                mergeMap(({ input }) => (input.kind === 'wiring' ? of(input.command) : EMPTY)),
            ),
            defer(() => wiringCommands$).pipe(
                mergeMap(
                    (command): Exclude<StateCommand, { kind: 'locate' | 'prune' | 'source' }>[] =>
                        command.kind === 'source' ||
                        command.kind === 'locate' ||
                        command.kind === 'prune'
                            ? []
                            : [command],
                ),
            ),
        ).pipe(
            map((command): WorkspaceAction => {
                switch (command.kind) {
                    case 'connect':
                        return {
                            kind: 'follow',
                            id: command.window,
                            input: command.input,
                            source: command.source,
                            store: command.store,
                        };
                    case 'disconnect':
                        return { kind: 'unfollow', id: command.window, input: command.input };
                    case 'bind':
                        return { kind: 'bind-store', id: command.window, store: command.store };
                }
            }),
        ),
        defer(() => inputs$).pipe(
            mergeMap(({ input }) => (input.kind === 'travel' ? of(input.offset) : EMPTY)),
            map((offset): WorkspaceAction => ({ kind: 'travel', offset })),
        ),
        defer(() => inputs$).pipe(
            mergeMap(({ from, input }) => (input.kind === 'close-others' ? of(from) : EMPTY)),
            map((keep): WorkspaceAction => ({ kind: 'close-others', keep })),
        ),
    );

    const history$: Observable<History> = merge(
        workspaceActions$.pipe(map((action): DocumentAction => ({ kind: 'workspace', action }))),
        defer(() => documentActions$),
        defer(() => inputs$).pipe(
            mergeMap(({ input }): TimeCommand[] =>
                input.kind === 'take-back' ? [{ kind: 'take-back', id: input.id }] : [],
            ),
        ),
    ).pipe(
        scan(
            (history: History, action: DocumentAction | TimeCommand) => reduced(history, action),
            begun,
        ),
        // Emitted into the replay buffer before the processes start and read it back.
        startWith(begun),
        // Not refCount: every document outlives the moment between two of its readers.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    const documents$ = history$.pipe(map(({ present }) => present));

    const workspace$: Observable<Workspace> = documents$.pipe(
        map(({ workspace }) => workspace),
        distinctUntilChanged(),
    );

    const interrupted$ = merge(canvas.gestures$, zoomSteps$);

    const located$ = defer(() => inputs$).pipe(
        mergeMap(({ input }) => (input.kind === 'locate' ? of(input.id) : EMPTY)),
        share(),
    );

    const jumps$: Observable<Jump> = merge(
        located$.pipe(map((id): Jump => ({ kind: 'window', id }))),
        merge(
            navigator.jumps$,
            picked$.pipe(mergeMap(picked => (picked.kind === 'section' ? of(picked.id) : EMPTY))),
            merge(
                canvas.steps$,
                picked$.pipe(
                    mergeMap(picked => (picked.kind === 'step' ? of(picked.direction) : EMPTY)),
                ),
            ).pipe(
                withLatestFrom(workspace$, viewport$),
                mergeMap(([direction, { sections: all, camera }, viewport]) => {
                    const id = steppedSection(all, camera, viewport, direction);

                    return id === null ? EMPTY : of(id);
                }),
            ),
        ).pipe(map((id): Jump => ({ kind: 'section', id }))),
    );

    const flights$: Observable<WorkspaceAction> = jumps$.pipe(
        withLatestFrom(workspace$, viewport$),
        mergeMap(([jump, { sections: all, processes, camera }, viewport]) => {
            const section = all.find(
                candidate => jump.kind === 'section' && candidate.id === jump.id,
            );
            const process = processes.find(
                candidate => jump.kind === 'window' && candidate.id === jump.id,
            );
            // At 100% unless the window would not fit: where the view stood says nothing about how to read it.
            const target =
                section !== undefined
                    ? fitted([section.rect], viewport)
                    : process !== undefined
                      ? centredOn(IDENTITY, boxOf(process), viewport)
                      : null;

            return target === null ? EMPTY : of(flight(camera, target, viewport));
        }),
        switchMap(path =>
            animationFrames().pipe(
                map(({ elapsed }) => Math.min(elapsed / path.duration, 1)),
                takeWhile(t => t < 1, true),
                map(t => path.at(t * t * (3 - 2 * t))),
                takeUntil(interrupted$),
            ),
        ),
        map((camera): WorkspaceAction => ({ kind: 'set-camera', camera })),
    );

    const camera$ = workspace$.pipe(
        map(({ camera }) => camera),
        distinctUntilChanged(),
    );

    const toolbarState$ = workspace$.pipe(
        map(({ toolbar }) => toolbar),
        distinctUntilChanged(),
    );

    const toolbarGestures$ = toolbarHost$(toolbar, canvas, toolbarState$);

    const ids$ = workspace$.pipe(
        map(({ processes }) => processes.map(({ id }) => id)),
        distinctUntilChanged(sameIds),
    );

    const slot$ = (id: ProcessId): Observable<Slot> =>
        workspace$.pipe(
            mergeMap(({ processes }) => {
                const index = processes.findIndex(process => process.id === id);
                const process = processes[index];

                // Depth is the position in the list, so raising is a reorder.
                return process === undefined
                    ? EMPTY
                    : of({
                          frame: { ...process.frame, z: index + 1 },
                          focused: index === processes.length - 1,
                      });
            }),
            distinctUntilChanged(sameSlot),
        );

    const binding$ = (id: ProcessId): Observable<StoreId> =>
        workspace$.pipe(
            mergeMap(({ processes }) => {
                const process = processes.find(candidate => candidate.id === id);

                return process === undefined ? EMPTY : of(process.store);
            }),
            distinctUntilChanged(),
        );

    const usersOf = (processes: readonly Process[], id: StoreId): number =>
        processes.filter(
            process => process.store === id || followedStores(process.follows).includes(id),
        ).length;

    const followOptions$ = ({
        id,
        program,
    }: Process): Observable<readonly FollowGroup[] | null> => {
        const inputs = inputsFor(program);
        const definitions = Object.values(inputs);
        const signals$ = definitions.some(definition => definition.from === 'store')
            ? defer(() => linked$)
            : of(new Map<string, Linked>());

        return definitions.every(definition => definition.from === 'own')
            ? of(null)
            : combineLatest([workspace$, signals$]).pipe(
                  map(([{ processes, stores }, signals]) => {
                      const process = processes.find(process => process.id === id);

                      return process === undefined
                          ? []
                          : inputGroups(process, inputs, processes, stores, signals);
                  }),
                  distinctUntilChanged(
                      (a, b) =>
                          a.length === b.length &&
                          a.every((group, index) =>
                              sameOptions(group.options, b[index]?.options ?? null),
                          ),
                  ),
              );
    };

    // null for a program that keeps no state of its own: its window shows no chip.
    const storeOptions$ = ({ id, program }: Process): Observable<readonly StoreOption[] | null> =>
        HOLDING[program] === null
            ? of(null)
            : workspace$.pipe(
                  map(({ processes, stores }) => {
                      const current = processes.find(process => process.id === id)?.store;

                      return stores
                          .filter(store => store.program === program)
                          .map((store): StoreOption => ({
                              id: store.id,
                              name: store.name,
                              colour: colourOf(store.id),
                              users: usersOf(processes, store.id),
                              current: store.id === current,
                          }));
                  }),
                  distinctUntilChanged(sameOptions),
              );

    const switches$: Observable<readonly SwitchGroup[]> = workspace$.pipe(
        map(({ processes, stores }) =>
            stores
                .map(
                    ({ id, name }) =>
                        `${id}:${name}:${processes.filter(p => p.store === id).length}`,
                )
                .join('|'),
        ),
        distinctUntilChanged(),
        withLatestFrom(workspace$),
        map(([, { processes, stores }]) =>
            CATEGORIES.map((category): SwitchGroup => ({
                title: category.title,
                items: programList
                    .filter(program => program.category === category.id)
                    .map((program): SwitchItem => ({
                        id: program.id,
                        title: program.title,
                        icon: program.icon,
                        minimum: program.minimum,
                        current: false,
                        stores:
                            HOLDING[program.id] === null
                                ? null
                                : withMain(program.id, stores).map((store): StoreOption => ({
                                      id: store.id,
                                      name: store.name,
                                      colour: colourOf(store.id),
                                      users: usersOf(processes, store.id),
                                      current: false,
                                  })),
                    })),
            })).filter(({ items }) => items.length > 0),
        ),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const followsOf$ = (id: ProcessId): Observable<Bindings> =>
        workspace$.pipe(
            mergeMap(({ processes }) => {
                const process = processes.find(candidate => candidate.id === id);

                return process === undefined ? EMPTY : of(process.follows);
            }),
            distinctUntilChanged(),
        );

    const clockOf$ = (id: ProcessId): Observable<PlaybackBinding | null> =>
        workspace$.pipe(
            map(({ processes }) => {
                const process = processes.find(candidate => candidate.id === id);

                return process === undefined
                    ? null
                    : playbackBinding(inputsFor(process.program), process.store, process.follows);
            }),
            distinctUntilChanged((a, b) => a?.store === b?.store),
        );

    const appeared$: Observable<Process> = workspace$.pipe(
        map(({ processes }) => processes),
        startWith<readonly Process[]>([]),
        pairwise(),
        mergeMap(([before, after]) =>
            after.filter(process => !before.some(({ id }) => id === process.id)),
        ),
    );

    const signals$: Observable<ProcessSignal> = appeared$.pipe(
        mergeMap(process => {
            const program = programOf(process.program);

            return program === undefined
                ? EMPTY
                : liveProcess$(
                      program,
                      {
                          id: process.id,
                          slot$: slot$(process.id),
                          store$: binding$(process.id),
                          clock$: clockOf$(process.id),
                          settings$: binding$(process.id).pipe(
                              switchMap(store =>
                                  settings$.pipe(
                                      map(all =>
                                          all.get(settingsKey(process.program, store, process.id)),
                                      ),
                                  ),
                              ),
                              distinctUntilChanged(),
                          ),
                      },
                      scoped(
                          inputsFor(process.program),
                          binding$(process.id),
                          clockOf$(process.id),
                          followsOf$(process.id),
                      ),
                      canvas,
                      storeOptions$(process),
                      switches$.pipe(
                          map(groups =>
                              groups.map(group => ({
                                  ...group,
                                  items: group.items.map(item => ({
                                      ...item,
                                      current: item.id === process.program,
                                  })),
                              })),
                          ),
                      ),
                      followOptions$(process),
                      defer(() => wiringEvents$).pipe(
                          mergeMap(event =>
                              event.kind === 'manage' && event.window === process.id
                                  ? of(true)
                                  : EMPTY,
                          ),
                      ),
                  ).pipe(takeUntil(ids$.pipe(filter(ids => !ids.includes(process.id)))));
        }),
        share(),
    );

    const session$ = merge(
        signals$.pipe(
            mergeMap((signal): ModeAction[] =>
                signal.to === 'state-mode' ? [{ kind: 'enter' }] : [],
            ),
        ),
        signals$.pipe(
            mergeMap((signal): ModeAction[] =>
                signal.to === 'state-busy'
                    ? [{ kind: 'busy', key: `menu:${signal.id}`, busy: signal.busy }]
                    : [],
            ),
        ),
        ids$.pipe(map((ids): ModeAction => ({ kind: 'windows', ids }))),
        canvas.stateHolds$.pipe(map((held): ModeAction => ({ kind: 'hold', held }))),
        canvas.blurs$.pipe(map((): ModeAction => ({ kind: 'blur' }))),
        navigator.modes$.pipe(map((): ModeAction => ({ kind: 'toggle' }))),
        canvas.escapes$.pipe(map((): ModeAction => ({ kind: 'close' }))),
        defer(() => wiringEvents$).pipe(
            mergeMap((event): ModeAction[] =>
                event.kind === 'busy' ||
                event.kind === 'expand' ||
                event.kind === 'spring' ||
                event.kind === 'settle'
                    ? [event]
                    : [],
            ),
        ),
    ).pipe(
        scan(reduceSession, defaultSession),
        startWith(defaultSession),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const mode$: Observable<StateMode> = session$.pipe(map(modeOf));

    const wiringView$: Observable<WiringView | null> = combineLatest([
        workspace$,
        defer(() => linked$),
        session$,
    ]).pipe(
        map(([workspace, signals, session]) => wiringOf(workspace, signals, inputsFor, session)),
        distinctUntilChanged(sameWiring),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const wiringEvents$: Observable<WiringCommand> = wiring.changes$.pipe(
        withLatestFrom(wiringView$),
        mergeMap(([event, view]) => {
            const command = commandFor(view, event);
            return command === null ? EMPTY : of(command);
        }),
        share(),
    );
    const wiringCommands$: Observable<StateCommand> = wiringEvents$.pipe(
        mergeMap(event => (event.kind === 'wire' ? of(event.command) : EMPTY)),
        share(),
    );

    const inputs$ = signals$.pipe(
        mergeMap(signal => (signal.to === 'app' ? of(signal) : EMPTY)),
        share(),
    );

    // A split-off store is seeded once, from the store it was split from, as it first appears.
    const storeEvents$: Observable<StoreEvent> = merge(
        workspace$.pipe(
            map(({ stores }) => stores),
            distinctUntilChanged(),
            pairwise(),
            mergeMap(([before, after]) =>
                from(
                    after.flatMap(({ id, copy }): StoreEvent[] =>
                        copy === null || before.some(store => store.id === id)
                            ? []
                            : [{ kind: 'copy', from: copy, to: id }],
                    ),
                ),
            ),
        ),
        // Bound stores and window ids both: settings of a document program are kept by window.
        inputs$.pipe(
            filter(({ input }) => input.kind === 'prune'),
            withLatestFrom(
                workspace$,
                defer(() => linked$),
            ),
            map(([, { processes }, all]): StoreEvent => ({
                kind: 'keep',
                stores: new Set([
                    ...reachedFrom(all, usedStores(processes)),
                    ...processes.map(({ id }) => id),
                ]),
            })),
        ),
    ).pipe(share());

    const placing$ = merge(
        inputs$.pipe(
            mergeMap(({ input }) => (input.kind === 'place-piece' ? [input.id] : [])),
            withLatestFrom(viewport$),
            map(([piece, viewport]): PlacingAction => ({
                kind: 'start',
                piece,
                at: centreOf(viewport),
            })),
        ),
        placement.changes$,
    ).pipe(
        scan(reducePlacing, idle),
        startWith(idle),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const documentActions$: Observable<DocumentAction> = merge(
        inputs$.pipe(
            mergeMap(({ program, store, from: id, input }): DocumentAction[] => {
                switch (input.kind) {
                    case 'settings':
                        return [
                            {
                                kind: 'settings',
                                key: settingsKey(program, store, id),
                                settings: input.settings,
                            },
                        ];
                    case 'todo':
                        return [{ kind: 'todos', store, command: input.command }];
                    case 'board':
                        return [{ kind: 'boards', store, command: input.command }];
                    case 'note':
                        return [{ kind: 'notes', store, command: input.command }];
                    case 'agenda':
                        return [{ kind: 'agendas', store, command: input.command }];
                    case 'habit':
                        return [{ kind: 'habits', store, command: input.command }];
                    case 'clock':
                        return [{ kind: 'clocks', store, command: input.command }];
                    case 'bookmark':
                        return [{ kind: 'bookmarks', store, command: input.command }];
                    case 'signal':
                        return [{ kind: 'signals', store, command: input.command }];
                    case 'paint':
                        return [{ kind: 'paintings', store, command: input.command }];
                    case 'pen':
                        return [{ kind: 'pens', store, command: input.command }];
                    case 'voice':
                        return [{ kind: 'voices', store, command: input.command }];
                    case 'drums':
                        return [{ kind: 'drums', store, command: input.command }];
                    case 'modulate':
                        return [
                            {
                                kind: 'link',
                                store: input.store,
                                param: input.param,
                                source: input.source,
                            },
                        ];
                    case 'library':
                        return [{ kind: 'library', command: input.command }];
                    case 'piece':
                        return [{ kind: 'pieces', command: input.command }];
                    case 'source':
                        return [
                            { kind: 'formula', formula: input.formula, text: input.text, from: id },
                        ];
                    case 'theme':
                        return [
                            { kind: 'theme', theme: input.theme, value: input.value, from: id },
                        ];
                    case 'appearance':
                        return [
                            { kind: 'appearance', name: input.name, value: input.value, from: id },
                        ];
                    case 'look':
                        return [{ kind: 'look', name: input.name }];
                    case 'prune':
                        return [{ kind: 'prune' }];
                    default:
                        return [];
                }
            }),
        ),
        wiringCommands$.pipe(
            mergeMap((command): DocumentAction[] =>
                command.kind === 'source'
                    ? [
                          {
                              kind: 'link',
                              store: command.store,
                              param: command.param,
                              source: command.source,
                          },
                      ]
                    : [],
            ),
        ),
        placing$.pipe(
            mergeMap(placing => (placing.mode === 'dropped' ? [placing] : [])),
            withLatestFrom(documents$),
            mergeMap(([{ piece, at }, { pieces, workspace }]): DocumentAction[] => {
                const chosen = pieces.items.find(({ id }) => id === piece);

                return chosen === undefined
                    ? []
                    : [
                          {
                              kind: 'place',
                              piece,
                              view: footprintAt(chosen.size, at, workspace.camera),
                          },
                      ];
            }),
        ),
        // defer: the clocks fold is built from what this fold produces.
        sections.gestures$.pipe(
            mergeMap(gesture => (gesture.kind === 'save' ? [gesture.id] : [])),
            withLatestFrom(
                documents$,
                defer(() => playbacks$),
            ),
            mergeMap(([section, documents, clocks]): DocumentAction[] => {
                const piece = pieceOf(documents, clocks, section);

                return piece === null ? [] : [{ kind: 'pieces', command: { kind: 'add', piece } }];
            }),
        ),
        sharedFormulas$.pipe(
            map((shared): DocumentAction => ({
                kind: 'library',
                command: { kind: 'import', ...shared },
            })),
        ),
        picked$.pipe(
            mergeMap((picked): DocumentAction[] =>
                picked.kind === 'look' ? [{ kind: 'look', name: picked.name }] : [],
            ),
        ),
    );

    const settings$ = documents$.pipe(
        map(({ settings }) => settings),
        distinctUntilChanged(),
    );
    const todos$ = documents$.pipe(
        map(({ todos }) => todos),
        distinctUntilChanged(),
    );
    const boards$ = documents$.pipe(
        map(({ boards }) => boards),
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
                a.drums === b.drums,
        ),
        map(linkedOf),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const timers$ = createTimers$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'focus' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        stored.focus,
    );

    // Like the playhead: storage keeps where each timer last stood still, or the debounce never settles.
    const timersRested$ = timers$.pipe(scan(restedTimers, stored.focus), distinctUntilChanged());

    const library$ = documents$.pipe(
        map(({ library }) => library),
        distinctUntilChanged(),
    );
    const pieces$ = documents$.pipe(
        map(({ pieces }) => pieces),
        distinctUntilChanged(),
    );

    const seeds$ = workspace$.pipe(
        map(({ stores }) => stores),
        distinctUntilChanged(),
        pairwise(),
        mergeMap(([before, after]) =>
            after.flatMap(({ id, clock }) =>
                clock === null || before.some(store => store.id === id)
                    ? []
                    : [{ kind: 'seed' as const, to: id, ...clock }],
            ),
        ),
    );

    const playbacks$ = createClocks$(
        routePlayback$(
            inputs$,
            workspace$.pipe(
                map(({ processes }) =>
                    processes.map(process => ({
                        id: process.id,
                        clock: playbackBinding(
                            inputsFor(process.program),
                            process.store,
                            process.follows,
                        ),
                    })),
                ),
            ),
        ),
        merge(storeEvents$, seeds$),
        stored.playback,
    );

    // Where each clock last rested: storage need not follow the playhead every frame it runs.
    const playbacksRested$ = playbacks$.pipe(
        scan(restedClocks, stored.playback),
        distinctUntilChanged(),
    );

    const playbackIn = inStore(playbacks$, initialClock);

    // Keyed by formula: one edit reaches every process showing that formula.
    const edits$ = documents$.pipe(
        map(({ formulas }) => formulas),
        distinctUntilChanged(),
    );

    const palettes$ = documents$.pipe(
        map(({ themes: all }) => all),
        distinctUntilChanged(),
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

    // Which stores hold any data, read as one sorted key so a ticking timer does not churn the graph.
    const held$: Observable<ReadonlySet<StoreId>> = combineLatest([
        todos$,
        boards$,
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
        pieces$,
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

    const todoIn = inStore(todos$, emptyTodos);
    const boardIn = inStore(boards$, defaultBoard);
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
        todo: todoIn,
        board: boardIn,
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
    const sources = { playback$: playbackIn, focus$: timerIn };

    const scoped = (
        inputs: ProgramInputs,
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
        const clock = clock$.pipe(
            switchMap(binding => (binding === null ? EMPTY : playbackIn(binding.store))),
            shareReplay({ bufferSize: 1, refCount: true }),
        );

        const progress = definitionOf(inputs, 'progress');
        // The follower's own loop: a voice's envelope is in seconds, and a window on another clock plays it on its own time.
        const seconds$ = clock.pipe(
            map(({ duration }) => duration),
            distinctUntilChanged(),
        );

        return {
            ...state,
            progress$: followed$('progress').pipe(
                mergeMap((source): ProgressConnection[] =>
                    source === null || progress?.from !== 'followed'
                        ? []
                        : [progressConnection(source, sources)],
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
            todos$: narrowed(todoIn).pipe(map(({ items }) => items)),
            board$: narrowed(boardIn),
            notes$: narrowed(notesIn),
            focus$: narrowed(timerIn),
            agenda$: narrowed(agendaIn),
            habits$: narrowed(habitsIn),
            clocks$: narrowed(clocksIn),
            bookmarks$: narrowed(bookmarksIn),
            signal$: narrowed(signalIn),
            wave$: narrowed(waveIn),
            followedDriver$: input =>
                followed$(input).pipe(
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
            followedPicture$: input =>
                followed$(input).pipe(
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

    const toolbarView$ = toolbarState$.pipe(
        map((state): ToolbarView =>
            state.kind === 'docked'
                ? { placement: state.edge, retracted: state.retracted }
                : { placement: 'float', retracted: false },
        ),
    );

    return merge(
        chime$(timers$),
        persistState$(
            combineLatest({
                workspace: workspace$,
                look: look$,
                looks: looks$.pipe(map(valuesOf)),
                formulas: edits$.pipe(map(valuesOf)),
                themes: palettes$.pipe(map(valuesOf)),
                settings: settings$,
                todos: todos$,
                board: boards$,
                notes: notes$,
                focus: timersRested$,
                playback: playbacksRested$,
                agenda: agendas$,
                habits: habits$,
                clocks: clocks$,
                bookmarks: bookmarks$,
                signals: waves$,
                paint: paintings$,
                pens: pens$,
                voices: voices$,
                drums: drums$,
                library: library$,
                pieces: pieces$,
                seq: history$.pipe(
                    map(({ seq }) => seq),
                    distinctUntilChanged(),
                ),
            }),
        ),
        canvas.connect$(
            camera$,
            look$.pipe(
                switchMap(appearance$),
                map(({ value }) => variables(value)),
            ),
            mode$.pipe(map(mode => mode.active)),
        ),
        toolbar.connect$(toolbarView$),
        seams.connect$(workspace$.pipe(map(seamsOf))),
        wiring.connect$(wiringView$),
        placement.connect$(
            combineLatest([placing$, camera$, pieces$]).pipe(
                map(([placing, camera, { items }]) => {
                    const piece =
                        placing.mode === 'placing'
                            ? items.find(({ id }) => id === placing.piece)
                            : undefined;

                    return placing.mode !== 'placing' || piece === undefined
                        ? null
                        : ghostOf(piece, placing.at, camera);
                }),
            ),
        ),
        palette.connect$(
            workspace$.pipe(map(({ sections: all }) => commandsOf(programList, all))),
            paletteOpen$,
        ),
        sections.connect$(
            workspace$.pipe(
                map(({ sections: all }) =>
                    all.map(({ id, name, rect }): SectionView => ({ id, name, ...rect })),
                ),
            ),
        ),
        navigator.connect$(
            combineLatest([workspace$, viewport$]).pipe(
                map(([{ processes, sections: all, camera }, viewport]) =>
                    minimapOf(processes.map(boxOf), all, camera, viewport),
                ),
            ),
            camera$.pipe(map(zoomLabel)),
            workspace$.pipe(map(({ minimap }) => minimap)),
            history$.pipe(
                map(({ cursor, steps }) => ({ undo: cursor > 0, redo: cursor < steps.length })),
            ),
            mode$.pipe(map(mode => mode.active)),
        ),
    ).subscribe();
};

bootstrap();
