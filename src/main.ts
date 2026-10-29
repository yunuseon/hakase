import { defer, EMPTY, merge, of, type Observable } from 'rxjs';
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
    takeUntil,
    withLatestFrom,
} from 'rxjs/operators';
import './styles.css';
import { zoomLabel } from './components/canvas/camera.ts';
import { HksCanvas } from './components/canvas/canvas.component.ts';
import { HksToolbar } from './components/toolbar/toolbar.component.ts';
import type { ToolbarView } from './components/toolbar/toolbar.ts';
import { formulas, type FormulaName } from './components/sketch/formulas/registry.ts';
import type { Theme } from './components/sketch/theme.ts';
import { themes, type ThemeName } from './components/sketch/themes/registry.ts';
import type { Frame } from './components/window/frame.ts';
import { viewportSize } from './lib/dom.ts';
import { viewport$ } from './lib/rx.ts';
import { liveProcess$, type ProcessSignal } from './process.ts';
import {
    isProgramId,
    type AppState,
    type ProcessId,
    type Program,
    type ProgramId,
    type Written,
} from './program.ts';
import { formulaProgram } from './programs/formula.program.ts';
import { playheadProgram } from './programs/playhead.program.ts';
import { sketchProgram } from './programs/sketch.program.ts';
import { themeProgram } from './programs/theme.program.ts';
import { timelineProgram } from './programs/timeline.program.ts';
import { createPlayhead$, defaultDuration, isPlaying$ } from './shared/playhead.ts';
import { toolbarHost$ } from './toolbar-host.ts';
import { persistWorkspace$, restoreWorkspace } from './workspace-store.ts';
import {
    defaultWorkspace,
    reduceWorkspace,
    type Process,
    type Workspace,
    type WorkspaceAction,
} from './workspace.ts';

const programs: readonly Program[] = [
    formulaProgram,
    themeProgram,
    sketchProgram,
    timelineProgram,
    playheadProgram,
];

const programOf = (id: ProgramId): Program | undefined =>
    programs.find(program => program.id === id);

const faces = programs.map(({ id, title, icon }) => ({ id, title, icon }));

const sameFrame = (a: Frame, b: Frame): boolean =>
    a.x === b.x && a.y === b.y && a.z === b.z && a.width === b.width && a.height === b.height;

const sameIds = (a: readonly ProcessId[], b: readonly ProcessId[]): boolean =>
    a.length === b.length && a.every((id, index) => id === b[index]);

const bootstrap = () => {
    const canvas = new HksCanvas();
    document.body.append(canvas);

    const toolbar = new HksToolbar().items(faces);
    toolbar.slot = 'chrome';
    canvas.append(toolbar);

    const launches$ = toolbar.launches$.pipe(
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

    const zoomSteps$ = merge(toolbar.zooms$, canvas.keys$).pipe(
        withLatestFrom(viewport$),
        map(([command, viewport]): WorkspaceAction => ({ kind: 'zoom-step', command, viewport })),
    );

    const toolbarActions$ = merge(
        toolbar.placements$.pipe(
            map((placement): WorkspaceAction => ({ kind: 'place-toolbar', placement })),
        ),
        toolbar.retracts$.pipe(map((): WorkspaceAction => ({ kind: 'retract-toolbar' }))),
        // defer: the toolbar's window is opened from the state this very fold produces.
        defer(() => toolbarGestures$).pipe(
            map((gesture): WorkspaceAction => ({ kind: 'toolbar-window', gesture })),
        ),
    );

    const seed = restoreWorkspace() ?? defaultWorkspace(viewportSize());

    // defer, or the cycle is evaluated at construction: signals$ is built from this.
    const workspace$: Observable<Workspace> = merge(
        launches$,
        zoomSteps$,
        canvas.gestures$,
        toolbarActions$,
        defer(() => signals$).pipe(
            mergeMap(signal => (signal.to === 'workspace' ? of(signal.action) : EMPTY)),
        ),
    ).pipe(
        scan(reduceWorkspace, seed),
        // Emitted into the replay buffer before the processes start and read it back.
        startWith(seed),
        shareReplay({ bufferSize: 1, refCount: true }),
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

    const frame$ = (id: ProcessId): Observable<Frame> =>
        workspace$.pipe(
            mergeMap(({ processes }) => {
                const index = processes.findIndex(process => process.id === id);
                const process = processes[index];

                // Depth is the position in the list, so raising is a reorder.
                return process === undefined ? EMPTY : of({ ...process.frame, z: index + 1 });
            }),
            distinctUntilChanged(sameFrame),
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
                      { id: process.id, frame$: frame$(process.id) },
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

    const commands$ = inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'transport' ? of(input.command) : EMPTY)),
        share(),
    );

    const playing$ = isPlaying$(commands$).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const duration$ = inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'duration' ? of(input.seconds) : EMPTY)),
        startWith(defaultDuration),
        distinctUntilChanged(),
        // Not refCount: closing the last timeline must not reset the clock to the default.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    // Keyed by formula: one edit reaches every process showing that formula.
    const edits$ = inputs$.pipe(
        mergeMap(({ from, input }) =>
            input.kind === 'source'
                ? of({ from, formula: input.formula, text: input.text })
                : EMPTY,
        ),
        scan(
            (edits, { formula, text, from }): ReadonlyMap<FormulaName, Written<string>> =>
                new Map(edits).set(formula, { value: text, from }),
            new Map<FormulaName, Written<string>>(),
        ),
        startWith(new Map<FormulaName, Written<string>>()),
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
            new Map<ThemeName, Written<Theme>>(),
        ),
        startWith(new Map<ThemeName, Written<Theme>>()),
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    const diagnostics$ = inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'diagnostic' ? of(input) : EMPTY)),
        scan(
            (all, { formula, message }) => new Map(all).set(formula, message),
            new Map<FormulaName, string | null>(),
        ),
        startWith(new Map<FormulaName, string | null>()),
        // Same: an editor switching formula drops the only subscriber for a moment.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    const state: AppState = {
        playing$,
        playhead$: createPlayhead$(
            inputs$.pipe(mergeMap(({ input }) => (input.kind === 'scrub' ? of(input.at) : EMPTY))),
            commands$,
            playing$,
            duration$,
        ).pipe(shareReplay({ bufferSize: 1, refCount: true })),
        duration$,
        zoom$: camera$.pipe(
            map(({ zoom }) => zoom),
            distinctUntilChanged(),
        ),
        source$: (formula: FormulaName) =>
            edits$.pipe(
                map(edits => edits.get(formula) ?? { value: formulas[formula].source, from: null }),
            ),
        theme$: (theme: ThemeName) =>
            palettes$.pipe(map(all => all.get(theme) ?? { value: themes[theme], from: null })),
        error$: (formula: FormulaName) =>
            diagnostics$.pipe(
                map(all => all.get(formula) ?? null),
                distinctUntilChanged(),
            ),
    };

    const runningPrograms$ = workspace$.pipe(
        map(({ processes }) => [...new Set(processes.map(({ program }) => program))].sort().join()),
        distinctUntilChanged(),
        map(key => new Set(key === '' ? [] : key.split(','))),
    );

    const toolbarView$ = toolbarState$.pipe(
        map((state): ToolbarView =>
            state.kind === 'docked'
                ? { placement: state.edge, retracted: state.retracted }
                : { placement: 'float', retracted: false },
        ),
    );

    return merge(
        persistWorkspace$(workspace$),
        canvas.connect$(camera$),
        toolbar.connect$(runningPrograms$, camera$.pipe(map(zoomLabel)), toolbarView$),
    ).subscribe();
};

bootstrap();
