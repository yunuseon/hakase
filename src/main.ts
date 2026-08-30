import { combineLatest, EMPTY, merge, of } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, scan, shareReplay, startWith } from 'rxjs/operators';
import './styles.css';
import { requireElement, requireElementById, viewportSize } from './lib/dom.ts';
import { formulas } from './model/formulas/registry.ts';
import {
    clampToViewport,
    defaultLayout,
    reduceLayout,
    type Placement,
    type WindowId,
} from './model/layout.ts';
import type { CanvasSize, SketchParams } from './model/params.ts';
import { createPlayhead$ } from './model/playhead.ts';
import { initialTerminal, reduceTerminal, type TerminalAction } from './model/terminal.ts';
import { HksCircularSlider } from './view/components/circular-slider/circular-slider.component.ts';
import { HksFormulaEditor } from './view/components/formula-editor/formula-editor.component.ts';
import { HksFpsCounter } from './view/components/fps-counter/fps-counter.component.ts';
import { HksLinearSlider } from './view/components/linear-slider/linear-slider.component.ts';
import { HksSketch } from './view/components/sketch/sketch.component.ts';
import { createControls } from './view/controls.ts';
import { compileFormula$ } from './view/formula.ts';
import { persistLayout$, restoreLayout } from './view/layout-store.ts';
import { terminalActions$ } from './view/shortcuts.ts';
const sameSize = (a: CanvasSize, b: CanvasSize): boolean =>
    a.width === b.width && a.height === b.height;

const sameFrame = (a: Placement & { width: number; height: number }, b: typeof a): boolean =>
    a.x === b.x && a.y === b.y && a.z === b.z && a.width === b.width && a.height === b.height;

const bootstrap = () => {
    const linearSlider = requireElement(document, 'hks-linear-slider', HksLinearSlider);
    const circularSlider = requireElement(document, 'hks-circular-slider', HksCircularSlider);
    const editor = requireElement(document, 'hks-formula-editor', HksFormulaEditor);
    const sketch = requireElement(document, 'hks-sketch', HksSketch);
    const fpsCounter = requireElement(document, 'hks-fps-counter', HksFpsCounter);

    const controls = createControls(requireElementById('controls'));

    const playhead$ = createPlayhead$(
        [linearSlider.changes$, circularSlider.changes$],
        controls.timeline$,
    ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const preset$ = controls.sketch$.pipe(
        map(({ formula }) => formulas[formula].source),
        distinctUntilChanged(),
    );

    const terminal$ = merge(
        terminalActions$,
        editor.styleToggles$.pipe(map((): TerminalAction => ({ kind: 'switch' }))),
    ).pipe(
        scan(reduceTerminal, initialTerminal),
        startWith(initialTerminal),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const viewport = viewportSize();
    const restored = restoreLayout();
    const seed = restored === null ? defaultLayout(viewport) : clampToViewport(restored, viewport);

    const layout$ = merge(
        editor.frame$,
        sketch.frame$,
        linearSlider.frame$,
        circularSlider.frame$,
    ).pipe(
        scan(reduceLayout, seed),
        startWith(seed),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const frameOf = (id: WindowId) =>
        layout$.pipe(
            map(layout => layout.frames[id]),
            distinctUntilChanged(sameFrame),
        );

    const size$ = frameOf('sketch').pipe(
        map(({ width, height }) => ({ width, height })),
        distinctUntilChanged(sameSize),
    );

    const params$ = combineLatest([controls.sketch$, size$]).pipe(
        map(([panel, size]): SketchParams => ({ ...panel, ...size })),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const source$ = merge(preset$, editor.changes$);

    const compiled$ = compileFormula$(sketch.gl, source$).pipe(
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    // On failure sketch$ does not emit, so the canvas keeps the last shader.
    const sketch$ = compiled$.pipe(
        mergeMap(result => (result.ok ? of(result.sketch) : EMPTY)),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const error$ = compiled$.pipe(map(result => (result.ok ? null : result.message)));

    return merge(
        linearSlider.connect$(playhead$, frameOf('timeline')),
        circularSlider.connect$(playhead$, frameOf('playhead')),
        editor.connect$(preset$, error$, terminal$, frameOf('terminal')),
        sketch.connect$(params$, playhead$, sketch$, frameOf('sketch')),
        fpsCounter.connect$(playhead$),
        persistLayout$(layout$),
    ).subscribe();
};

bootstrap();
