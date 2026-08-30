import { EMPTY, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, scan, shareReplay, startWith, switchMap } from 'rxjs/operators';
import './styles.css';
import { compileFormula$ } from './components/sketch/compile.ts';
import { formulas } from './components/sketch/formulas/registry.ts';
import { persistLayout$, restoreLayout } from './layout-store.ts';
import { liveWindow$ } from './live-window.ts';
import type { Frame } from './components/window/frame.ts';
import { clampToViewport, defaultLayout, reduceLayout } from './layout.ts';
import { createControls } from './controls.ts';
import { viewportSize } from './lib/dom.ts';
import type { AppState, Program, ProgramId } from './program.ts';
import { editor, formulaProgram } from './programs/formula.program.ts';
import { dial, playheadProgram } from './programs/playhead.program.ts';
import { sketch, sketchProgram } from './programs/sketch.program.ts';
import { timeline, timelineProgram } from './programs/timeline.program.ts';
import { createPlayhead$ } from './shared/playhead.ts';

const programs: readonly Program[] = [
    formulaProgram,
    sketchProgram,
    timelineProgram,
    playheadProgram,
];

const sameFrame = (a: Frame, b: Frame): boolean =>
    a.x === b.x && a.y === b.y && a.z === b.z && a.width === b.width && a.height === b.height;

const bootstrap = () => {
    const panel = document.createElement('aside');
    panel.id = 'controls';
    document.body.append(panel);
    const controls = createControls(panel);

    const actions$ = merge(
        ...programs.map(program =>
            controls.windows$.pipe(
                map(visibility => visibility[program.id]),
                distinctUntilChanged(),
                switchMap(open => (open ? liveWindow$(program, state) : EMPTY)),
            ),
        ),
    );

    const viewport = viewportSize();
    const restored = restoreLayout();
    const seed = restored === null ? defaultLayout(viewport) : clampToViewport(restored, viewport);

    const layout$ = actions$.pipe(
        scan(reduceLayout, seed),
        // Emitted into the replay buffer before the windows mount and read it back.
        startWith(seed),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const frame$ = (id: ProgramId): Observable<Frame> =>
        layout$.pipe(
            map(layout => layout.frames[id]),
            distinctUntilChanged(sameFrame),
        );

    const playhead$ = createPlayhead$([timeline.changes$, dial.changes$], controls.timeline$).pipe(
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const preset$ = controls.formula$.pipe(map(name => formulas[name].source));

    const state: AppState = {
        frame$,
        playhead$,
        preset$,
        panel$: controls.sketch$,
        compiled$: compileFormula$(sketch.gl, merge(preset$, editor.changes$)).pipe(
            shareReplay({ bufferSize: 1, refCount: true }),
        ),
    };

    return persistLayout$(layout$).subscribe();
};

bootstrap();
