import { animationFrames, combineLatest, defer, EMPTY, merge, of, type Observable } from 'rxjs';
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
import { HksToolbar } from './components/toolbar/toolbar.component.ts';
import type { ToolbarView } from './components/toolbar/toolbar.ts';
import { reduceLibrary, sourceOf, type FormulaId, type LibraryCommand } from './library.ts';
import { sharedFormulas$ } from './share.ts';
import type { Theme } from './components/sketch/theme.ts';
import { reduceTodos } from './components/todo/todo.ts';
import type { Settings } from './settings.ts';
import { themes, type ThemeName } from './components/sketch/themes/registry.ts';
import { viewportSize } from './lib/dom.ts';
import { viewport$ } from './lib/rx.ts';
import { liveProcess$, type ProcessSignal } from './process.ts';
import {
    isProgramId,
    type AppState,
    type ProcessId,
    type Program,
    type ProgramId,
    type Slot,
    type Task,
    type Written,
    restored,
    valuesOf,
} from './program.ts';
import { appearanceProgram } from './programs/appearance.program.ts';
import { formulaProgram } from './programs/formula.program.ts';
import { playheadProgram } from './programs/playhead.program.ts';
import { tasksProgram } from './programs/tasks.program.ts';
import { todoProgram } from './programs/todo.program.ts';
import { sketchProgram } from './programs/sketch.program.ts';
import { themeProgram } from './programs/theme.program.ts';
import { timelineProgram } from './programs/timeline.program.ts';
import { createTransport$, type Transport } from './shared/playhead.ts';
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
    type Process,
    type Workspace,
    type WorkspaceAction,
} from './workspace.ts';

const programs: readonly Program[] = [
    formulaProgram,
    themeProgram,
    appearanceProgram,
    sketchProgram,
    timelineProgram,
    playheadProgram,
    tasksProgram,
    todoProgram,
];

const programOf = (id: ProgramId): Program | undefined =>
    programs.find(program => program.id === id);

const faces = programs.map(({ id, title, icon }) => ({ id, title, icon }));

const sameSlot = ({ frame: a, focused }: Slot, { frame: b, focused: other }: Slot): boolean =>
    focused === other &&
    a.x === b.x &&
    a.y === b.y &&
    a.z === b.z &&
    a.width === b.width &&
    a.height === b.height;

const sameIds = (a: readonly ProcessId[], b: readonly ProcessId[]): boolean =>
    a.length === b.length && a.every((id, index) => id === b[index]);

const bootstrap = () => {
    const canvas = new HksCanvas();
    document.body.append(canvas);

    const toolbar = new HksToolbar().items(faces);
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

    const stored = restoreState();
    const seed = stored.workspace ?? defaultWorkspace(viewportSize());

    // defer, or the cycle is evaluated at construction: signals$ is built from this.
    const workspace$: Observable<Workspace> = merge(
        launches$,
        zoomSteps$,
        canvas.gestures$,
        canvas.edits$.pipe(map((kind): WorkspaceAction => ({ kind }))),
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
            mergeMap(({ from, input }) => (input.kind === 'close-others' ? of(from) : EMPTY)),
            map((keep): WorkspaceAction => ({ kind: 'close-others', keep })),
        ),
    ).pipe(
        scan(reduceHistory, startHistory(seed)),
        map(({ present }) => present),
        // Emitted into the replay buffer before the processes start and read it back.
        startWith(seed),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

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
                          settings$: settings$.pipe(
                              map(all => all.get(process.id)),
                              distinctUntilChanged(),
                          ),
                      },
                      state,
                      canvas,
                  ).pipe(takeUntil(ids$.pipe(filter(ids => !ids.includes(process.id)))));
        }),
        share(),
    );

    const inputs$ = signals$.pipe(
        mergeMap(signal => (signal.to === 'app' ? of(signal) : EMPTY)),
        share(),
    );

    // Not refCount: a window's settings must outlive the moment between two of its readers.
    const settings$ = inputs$.pipe(
        mergeMap(({ from, input }) => (input.kind === 'settings' ? of({ from, input }) : EMPTY)),
        scan(
            (all, { from, input }): ReadonlyMap<ProcessId, Settings> =>
                new Map(all).set(from, input.settings),
            stored.settings,
        ),
        startWith(stored.settings),
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    // Not refCount: the list outlives every todo window, and all of them show the same one.
    const todos$ = inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'todo' ? of(input.command) : EMPTY)),
        scan(reduceTodos, stored.todos),
        startWith(stored.todos),
        shareReplay({ bufferSize: 1, refCount: false }),
    );

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

    const commands$ = inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'transport' ? of(input.command) : EMPTY)),
        share(),
    );

    const duration$ = inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'duration' ? of(input.seconds) : EMPTY)),
        startWith(stored.duration),
        distinctUntilChanged(),
        // Not refCount: closing the last timeline must not reset the clock to the default.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    const transport$ = createTransport$(
        inputs$.pipe(mergeMap(({ input }) => (input.kind === 'scrub' ? of(input.at) : EMPTY))),
        commands$,
        duration$,
        { at: stored.playhead, playing: false, looping: stored.looping },
    );

    // Where playback last rested: storage need not follow the playhead every frame it runs.
    const rested$ = transport$.pipe(
        scan((kept: Transport, now) => (now.playing ? { ...now, at: kept.at } : now), {
            at: stored.playhead,
            playing: false,
            looping: stored.looping,
        }),
        distinctUntilChanged((a, b) => a.at === b.at && a.looping === b.looping),
    );

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

    const state: AppState = {
        playhead$: transport$.pipe(
            map(({ at }) => at),
            distinctUntilChanged(),
        ),
        playing$: transport$.pipe(
            map(({ playing }) => playing),
            distinctUntilChanged(),
        ),
        looping$: transport$.pipe(
            map(({ looping }) => looping),
            distinctUntilChanged(),
        ),
        duration$,
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
        todos$: todos$.pipe(map(({ items }) => items)),
        library$,
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

    const toolbarView$ = toolbarState$.pipe(
        map((state): ToolbarView =>
            state.kind === 'docked'
                ? { placement: state.edge, retracted: state.retracted }
                : { placement: 'float', retracted: false },
        ),
    );

    return merge(
        persistState$(
            combineLatest({
                workspace: workspace$,
                look: look$,
                looks: looks$.pipe(map(valuesOf)),
                formulas: edits$.pipe(map(valuesOf)),
                themes: palettes$.pipe(map(valuesOf)),
                duration: duration$,
                rested: rested$,
                settings: settings$,
                todos: todos$,
                library: library$,
            }).pipe(
                map(({ rested, ...parts }) => ({
                    ...parts,
                    playhead: rested.at,
                    looping: rested.looping,
                })),
            ),
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
            workspace$.pipe(map(({ sections: all }) => commandsOf(programs, all))),
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
        ),
    ).subscribe();
};

bootstrap();
