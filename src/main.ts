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
import { fitted, flight, zoomLabel } from './shared/camera.ts';
import { HksCanvas } from './components/canvas/canvas.component.ts';
import { HksNavigator } from './components/navigator/navigator.component.ts';
import { minimapOf } from './components/navigator/navigator.ts';
import { HksSeams } from './components/seams/seams.component.ts';
import { HksSections } from './components/sections/sections.component.ts';
import { HksPalette } from './components/palette/palette.component.ts';
import { commandsOf, pickedAction, pickedOf, steppedSection } from './commands.ts';
import type { SectionView } from './components/sections/sections.ts';
import { HksToolbar, type ToolbarCategory } from './components/toolbar/toolbar.component.ts';
import type { ToolbarView } from './components/toolbar/toolbar.ts';
import { reduceLibrary, sourceOf, type FormulaId, type LibraryCommand } from './library.ts';
import { sharedFormulas$ } from './share.ts';
import type { Theme } from './components/sketch/theme.ts';
import { reduceBoard } from './components/board/board.ts';
import { reduceNotes } from './components/note/note.ts';
import { createTimers$, initialFocus, restedTimers } from './components/focus/focus.ts';
import { defaultBookmarks } from './components/bookmarks/bookmarks.ts';
import { defaultSignal, reduceSignal } from './shared/signal.ts';
import { patchOf, samePatch } from './patch.ts';
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
    perStore$,
    reduceStores,
    mainStore,
    type StoreEntry,
    type StoreEvent,
    type StoreAction,
    type StoreId,
} from './stores.ts';
import { routePlayback$ } from './playback-routing.ts';
import type { ProgressConnection } from './progress.ts';
import { chime$ } from './chime.ts';
import { reduceAgenda } from './components/agenda/agenda.ts';
import { reduceHabits } from './components/habits/habits.ts';
import { reduceClocks } from './components/clocks/clocks.ts';
import { reduceBookmarks } from './components/bookmarks/bookmarks.ts';
import { reduceTodos } from './components/todo/todo.ts';
import { defaultSketch, type Settings } from './settings.ts';
import { themes, type ThemeName } from './components/sketch/themes/registry.ts';
import { viewportSize } from './lib/dom.ts';
import { viewport$ } from './lib/rx.ts';
import type {
    FollowGroup,
    StoreOption,
    SwitchGroup,
    SwitchItem,
} from './components/window/frame.ts';
import { catalogOf, parseTarget, sameCatalog, type Global } from './inventory.ts';
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
import { toolbarHost$ } from './toolbar-host.ts';
import { persistState$, restoreState } from './state-store.ts';
import {
    boxOf,
    defaultWorkspace,
    listed,
    seamsOf,
    sectionAction,
    reduceHistory,
    startHistory,
    type History,
    type Process,
    usedStores,
    type Workspace,
    type WorkspaceAction,
} from './workspace.ts';

type StoreKey =
    | 'progress$'
    | 'playhead$'
    | 'playing$'
    | 'looping$'
    | 'duration$'
    | 'todos$'
    | 'board$'
    | 'notes$'
    | 'focus$'
    | 'agenda$'
    | 'habits$'
    | 'clocks$'
    | 'bookmarks$'
    | 'signal$'
    | 'followedSignal$';

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

    const sections = new HksSections();
    canvas.append(sections);

    const palette = new HksPalette();
    palette.slot = 'chrome';
    canvas.append(palette);

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
        sections.gestures$.pipe(map(sectionAction)),
        picked$.pipe(
            withLatestFrom(viewport$),
            mergeMap(([picked, viewport]) => {
                const action = pickedAction(picked, viewport);

                return action === null ? EMPTY : of(action);
            }),
        ),
        // defer: a flight starts from the camera this very fold holds.
        defer(() => flights$),
        // defer: the toolbar's window is opened from the state this very fold produces.
        defer(() => toolbarGestures$).pipe(
            map((gesture): WorkspaceAction => ({ kind: 'toolbar-window', gesture })),
        ),
    );

    const stored = restoreState(inputsFor);
    const seed = stored.workspace ?? defaultWorkspace(viewportSize(), inputsFor);

    // defer, or the cycle is evaluated at construction: signals$ is built from this.
    const begun = startHistory(seed);

    const history$: Observable<History> = merge(
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
        defer(() => inputs$).pipe(
            mergeMap(({ input }) => (input.kind === 'patch' ? of(input.command) : EMPTY)),
            map((command): WorkspaceAction =>
                command.kind === 'connect'
                    ? {
                          kind: 'follow',
                          id: command.sink,
                          input: command.input,
                          source: command.source,
                          store: command.store,
                      }
                    : { kind: 'unfollow', id: command.sink, input: command.input },
            ),
        ),
        defer(() => inputs$).pipe(
            mergeMap(({ input }) => (input.kind === 'travel' ? of(input.offset) : EMPTY)),
            map((offset): WorkspaceAction => ({ kind: 'travel', offset })),
        ),
        defer(() => inputs$).pipe(
            filter(({ input }) => input.kind === 'prune'),
            map((): WorkspaceAction => ({ kind: 'prune-stores' })),
        ),
        defer(() => inputs$).pipe(
            mergeMap(({ from, input }) => (input.kind === 'close-others' ? of(from) : EMPTY)),
            map((keep): WorkspaceAction => ({ kind: 'close-others', keep })),
        ),
    ).pipe(
        scan(
            (history: History, action: WorkspaceAction) =>
                reduceHistory(history, action, inputsFor),
            begun,
        ),
        // Emitted into the replay buffer before the processes start and read it back.
        startWith(begun),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const workspace$: Observable<Workspace> = history$.pipe(map(({ present }) => present));

    const interrupted$ = merge(canvas.gestures$, zoomSteps$);

    const jumps$ = merge(
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
    );

    const flights$: Observable<WorkspaceAction> = jumps$.pipe(
        withLatestFrom(workspace$, viewport$),
        mergeMap(([id, { sections: all, camera }, viewport]) => {
            const section = all.find(candidate => candidate.id === id);

            return section === undefined
                ? EMPTY
                : of(flight(camera, fitted([section.rect], viewport), viewport));
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

    // null for a program that follows nothing: the popover then has no section for it.
    // From the program's own inputs: one section per kind of state each accepts, and none for its own store.
    const followOptions$ = ({
        id,
        program,
    }: Process): Observable<readonly FollowGroup[] | null> => {
        const followedInputs = Object.entries(inputsFor(program)).flatMap(([name, definition]) =>
            definition.from === 'followed' ? [{ name, definition }] : [],
        );

        return followedInputs.length === 0
            ? of(null)
            : workspace$.pipe(
                  map(({ processes, stores }) => {
                      const follows = processes.find(process => process.id === id)?.follows ?? {};

                      return followedInputs.flatMap(({ name, definition }) => {
                          const binding = followedBy(follows, name);

                          const choice = definition.sources.length > 1;

                          return definition.sources.map((source, index): FollowGroup => ({
                              input: name,
                              optional: index === 0 && definition.initial === null,
                              source: source.kind,
                              // Only where there is a choice of sources: "Playback · Playback" says nothing.
                              title: [
                                  definition.title,
                                  ...(choice ? [source.title] : []),
                                  ...(choice && source.access === 'read' ? ['read-only'] : []),
                              ].join(' · '),
                              options: withMain(source.program, stores).map(
                                  (store): StoreOption => ({
                                      id: store.id,
                                      name: store.name,
                                      colour: colourOf(store.id),
                                      users: usersOf(processes, store.id),
                                      current:
                                          binding?.kind === source.kind &&
                                          binding.store === store.id,
                                  }),
                              ),
                          }));
                      });
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

    // A document's main store is always on offer, registered yet or not: it is where its data lives.
    const withMain = (program: ProgramId, stores: readonly StoreEntry[]): readonly StoreEntry[] => {
        const own = stores.filter(store => store.program === program);

        return HOLDING[program]?.holds === 'document' && !own.some(({ id }) => id === program)
            ? [mainStore(program), ...own]
            : own;
    };

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
                  ).pipe(takeUntil(ids$.pipe(filter(ids => !ids.includes(process.id)))));
        }),
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
            withLatestFrom(workspace$),
            map(([, { processes }]): StoreEvent => ({
                kind: 'keep',
                stores: new Set([...usedStores(processes), ...processes.map(({ id }) => id)]),
            })),
        ),
    ).pipe(share());

    // A program whose store holds settings keys them by store; any other keys them by window.
    const settingsKey = (program: ProgramId, store: StoreId, from: ProcessId): string =>
        HOLDING[program]?.holds === 'settings' ? store : from;

    // Not refCount: a window's settings must outlive the moment between two of its readers.
    const settings$ = merge(
        inputs$.pipe(
            mergeMap(({ program, store, from: id, input }) =>
                input.kind === 'settings'
                    ? of<StoreAction<Settings>>({
                          kind: 'command',
                          store: settingsKey(program, store, id),
                          command: input.settings,
                      })
                    : EMPTY,
            ),
        ),
        storeEvents$,
    ).pipe(
        scan(
            (all: ReadonlyMap<string, Settings>, action: StoreAction<Settings>) =>
                action.kind === 'command'
                    ? new Map(all).set(action.store, action.command)
                    : reduceStores((_: Settings, next: Settings) => next, defaultSketch)(
                          all,
                          action,
                      ),
            stored.settings,
        ),
        startWith(stored.settings),
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    const todos$ = perStore$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'todo' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        reduceTodos,
        emptyTodos,
        stored.todos,
    );

    const boards$ = perStore$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'board' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        reduceBoard,
        defaultBoard,
        stored.board,
    );

    const notes$ = perStore$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'note' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        reduceNotes,
        emptyNotes,
        stored.notes,
    );

    const agendas$ = perStore$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'agenda' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        reduceAgenda,
        emptyAgenda,
        stored.agenda,
    );

    const habits$ = perStore$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'habit' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        reduceHabits,
        emptyHabits,
        stored.habits,
    );

    const clocks$ = perStore$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'clock' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        reduceClocks,
        defaultClocks,
        stored.clocks,
    );

    const waves$ = perStore$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'signal' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        reduceSignal,
        defaultSignal,
        stored.signals,
    );

    const bookmarks$ = perStore$(
        inputs$.pipe(
            mergeMap(({ store, input }) =>
                input.kind === 'bookmark' ? of({ store, command: input.command }) : EMPTY,
            ),
        ),
        storeEvents$,
        reduceBookmarks,
        defaultBookmarks,
        stored.bookmarks,
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

    const library$ = merge(
        inputs$.pipe(
            mergeMap(({ input }) => (input.kind === 'library' ? of(input.command) : EMPTY)),
        ),
        sharedFormulas$.pipe(map((shared): LibraryCommand => ({ kind: 'import', ...shared }))),
    ).pipe(
        scan(reduceLibrary, stored.library),
        startWith(stored.library),
        shareReplay({ bufferSize: 1, refCount: false }),
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
        storeEvents$,
        stored.playback,
    );

    // Where each clock last rested: storage need not follow the playhead every frame it runs.
    const playbacksRested$ = playbacks$.pipe(
        scan(restedClocks, stored.playback),
        distinctUntilChanged(),
    );

    const playbackIn = inStore(playbacks$, initialClock);

    // Keyed by formula: one edit reaches every process showing that formula.
    const edits$ = inputs$.pipe(
        mergeMap(({ from, input }) =>
            input.kind === 'source'
                ? of({ from, formula: input.formula, text: input.text })
                : EMPTY,
        ),
        scan(
            (edits, { formula, text, from }): ReadonlyMap<FormulaId, Written<string>> =>
                new Map(edits).set(formula, { value: text, from }),
            restored(stored.formulas),
        ),
        startWith(restored(stored.formulas)),
        // Not refCount: the last reader switching formula must not erase the edits.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    const palettes$ = inputs$.pipe(
        mergeMap(({ from, input }) =>
            input.kind === 'theme' ? of({ from, theme: input.theme, value: input.value }) : EMPTY,
        ),
        scan(
            (all, { theme, value, from }): ReadonlyMap<ThemeName, Written<Theme>> =>
                new Map(all).set(theme, { value, from }),
            restored(stored.themes),
        ),
        startWith(restored(stored.themes)),
        shareReplay({ bufferSize: 1, refCount: false }),
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

    const look$ = merge(
        inputs$.pipe(mergeMap(({ input }) => (input.kind === 'look' ? of(input.name) : EMPTY))),
        picked$.pipe(mergeMap(picked => (picked.kind === 'look' ? of(picked.name) : EMPTY))),
    ).pipe(
        startWith(stored.look),
        distinctUntilChanged(),
        // Not refCount: the look outlives every editor that picked it.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    const looks$ = inputs$.pipe(
        mergeMap(({ from, input }) =>
            input.kind === 'appearance'
                ? of({ from, name: input.name, value: input.value })
                : EMPTY,
        ),
        scan(
            (all, { name, value, from }): ReadonlyMap<AppearanceName, Written<Appearance>> =>
                new Map(all).set(name, { value, from }),
            restored(stored.looks),
        ),
        startWith(restored(stored.looks)),
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    const appearance$ = (name: AppearanceName): Observable<Written<Appearance>> =>
        looks$.pipe(map(all => all.get(name) ?? { value: appearances[name], from: null }));

    // Which stores hold any data, read as one sorted key so a ticking timer does not churn the catalog.
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
        catalog$: combineLatest([workspace$, held$]).pipe(
            map(([{ stores, processes }, held]) =>
                catalogOf(stores, processes, program => programOf(program)?.title ?? program, held),
            ),
            // The workspace emits on every pointer move of a drag; the tree changes far less often.
            distinctUntilChanged(sameCatalog),
        ),
        inspect$: (id: string) => inspected$(id),
        patch$: workspace$.pipe(
            map(workspace => patchOf(workspace, inputsFor, programOf)),
            distinctUntilChanged(samePatch),
        ),
        history$: history$.pipe(
            map(({ past, label, future }) => [
                ...past.map((entry, index) => ({
                    label: entry.label,
                    offset: index - past.length,
                })),
                { label, offset: 0 },
                ...future.map((entry, index) => ({ label: entry.label, offset: index + 1 })),
            ]),
        ),
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
    const timerIn = inStore(timers$, initialFocus);

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
            followedSignal$: input =>
                followed$(input).pipe(
                    switchMap(binding =>
                        binding?.kind === 'signal' ? signalIn(binding.store) : of(null),
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
                library: library$,
            }),
        ),
        canvas.connect$(
            camera$,
            look$.pipe(
                switchMap(appearance$),
                map(({ value }) => variables(value)),
            ),
        ),
        toolbar.connect$(toolbarView$),
        seams.connect$(workspace$.pipe(map(seamsOf))),
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
                map(({ past, future }) => ({ undo: past.length > 0, redo: future.length > 0 })),
            ),
        ),
    ).subscribe();
};

bootstrap();
