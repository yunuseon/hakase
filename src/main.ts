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
} from 'rxjs/operators';
import './styles.css';
import { HksDesktop } from './components/desktop/desktop.component.ts';
import { HksDock } from './components/dock/dock.component.ts';
import { formulas, type FormulaName } from './components/sketch/formulas/registry.ts';
import type { Frame } from './components/window/frame.ts';
import { createControls } from './controls.ts';
import { persistDesktop$, restoreDesktop } from './desktop-store.ts';
import {
    clampToViewport,
    defaultDesktop,
    reduceDesktop,
    type Desktop,
    type DesktopAction,
    type Process,
} from './desktop.ts';
import { viewportSize } from './lib/dom.ts';
import { liveProcess$, type ProcessSignal } from './process.ts';
import {
    isProgramId,
    type AppState,
    type ProcessId,
    type Program,
    type ProgramId,
    type Source,
} from './program.ts';
import { formulaProgram } from './programs/formula.program.ts';
import { playheadProgram } from './programs/playhead.program.ts';
import { sketchProgram } from './programs/sketch.program.ts';
import { timelineProgram } from './programs/timeline.program.ts';
import { createPlayhead$, isPlaying$ } from './shared/playhead.ts';

const programs: readonly Program[] = [
    formulaProgram,
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
    const surface = new HksDesktop().items(faces);
    document.body.append(surface);

    const panel = document.createElement('aside');
    panel.id = 'controls';
    document.body.append(panel);
    const controls = createControls(panel);

    const dock = new HksDock().items(faces);
    document.body.append(dock);

    const launches$ = merge(dock.activations$, surface.launches$).pipe(
        mergeMap((id): Observable<DesktopAction> => {
            const program = isProgramId(id) ? programOf(id) : undefined;

            return program === undefined
                ? EMPTY
                : of({
                      kind: 'launch',
                      program: program.id,
                      frame: { x: 60, y: 60, z: 0, ...program.size },
                  });
        }),
    );

    const shortcutMoves$ = surface.drags$.pipe(
        mergeMap(({ id, dx, dy }): Observable<DesktopAction> =>
            isProgramId(id) ? of({ kind: 'shortcut', program: id, dx, dy }) : EMPTY,
        ),
    );

    const viewport = viewportSize();
    const restored = restoreDesktop();
    const seed = restored === null ? defaultDesktop(viewport) : clampToViewport(restored, viewport);

    // defer, or the cycle is evaluated at construction: signals$ is built from this.
    const desktop$: Observable<Desktop> = merge(
        launches$,
        shortcutMoves$,
        defer(() => signals$).pipe(
            mergeMap(signal => (signal.to === 'desktop' ? of(signal.action) : EMPTY)),
        ),
    ).pipe(
        scan(reduceDesktop, seed),
        // Emitted into the replay buffer before the processes start and read it back.
        startWith(seed),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const ids$ = desktop$.pipe(
        map(({ processes }) => processes.map(({ id }) => id)),
        distinctUntilChanged(sameIds),
    );

    const frame$ = (id: ProcessId): Observable<Frame> =>
        desktop$.pipe(
            mergeMap(({ processes }) => {
                const index = processes.findIndex(process => process.id === id);
                const process = processes[index];

                // Depth is the position in the list, so raising is a reorder.
                return process === undefined ? EMPTY : of({ ...process.frame, z: index + 1 });
            }),
            distinctUntilChanged(sameFrame),
        );

    const appeared$: Observable<Process> = desktop$.pipe(
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
                : liveProcess$(program, { id: process.id, frame$: frame$(process.id) }, state).pipe(
                      takeUntil(ids$.pipe(filter(ids => !ids.includes(process.id)))),
                  );
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

    // Keyed by formula: one edit reaches every process showing that formula.
    const edits$ = inputs$.pipe(
        mergeMap(({ from, input }) =>
            input.kind === 'source'
                ? of({ from, formula: input.formula, text: input.text })
                : EMPTY,
        ),
        scan(
            (edits, { formula, text, from }): ReadonlyMap<FormulaName, Source> =>
                new Map(edits).set(formula, { text, from }),
            new Map<FormulaName, Source>(),
        ),
        startWith(new Map<FormulaName, Source>()),
        // Not refCount: the last reader switching formula must not erase the edits.
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
            controls.timeline$,
        ).pipe(shareReplay({ bufferSize: 1, refCount: true })),
        duration$: controls.timeline$.pipe(
            map(({ duration }) => duration),
            distinctUntilChanged(),
        ),
        source$: (formula: FormulaName) =>
            edits$.pipe(
                map(edits => edits.get(formula) ?? { text: formulas[formula].source, from: null }),
            ),
        error$: (formula: FormulaName) =>
            diagnostics$.pipe(
                map(all => all.get(formula) ?? null),
                distinctUntilChanged(),
            ),
    };

    const runningPrograms$ = desktop$.pipe(
        map(({ processes }) => [...new Set(processes.map(({ program }) => program))].sort().join()),
        distinctUntilChanged(),
        map(key => new Set(key === '' ? [] : key.split(','))),
    );

    const shortcuts$ = desktop$.pipe(
        map(({ shortcuts }) => shortcuts),
        distinctUntilChanged(),
    );

    return merge(
        persistDesktop$(desktop$),
        dock.connect$(runningPrograms$),
        surface.connect$(shortcuts$),
    ).subscribe();
};

bootstrap();
