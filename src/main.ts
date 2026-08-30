import { EMPTY, merge, of } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, shareReplay } from 'rxjs/operators';
import './styles.css';
import { requireElement } from './lib/dom.ts';
import { formulas } from './model/formulas/registry.ts';
import { createPlayhead$ } from './model/playhead.ts';
import { HksCircularSlider } from './view/components/circular-slider/circular-slider.component.ts';
import { HksFormulaEditor } from './view/components/formula-editor/formula-editor.component.ts';
import { HksFpsCounter } from './view/components/fps-counter/fps-counter.component.ts';
import { HksLinearSlider } from './view/components/linear-slider/linear-slider.component.ts';
import { HksSketch } from './view/components/sketch/sketch.component.ts';
import { createControls } from './view/controls.ts';
import { compileFormula$ } from './view/formula.ts';
const bootstrap = () => {
    const linearSlider = requireElement(document, 'hks-linear-slider', HksLinearSlider);
    const circularSlider = requireElement(document, 'hks-circular-slider', HksCircularSlider);
    const editor = requireElement(document, 'hks-formula-editor', HksFormulaEditor);
    const sketch = requireElement(document, 'hks-sketch', HksSketch);
    const fpsCounter = requireElement(document, 'hks-fps-counter', HksFpsCounter);

    const controls = createControls();

    const playhead$ = createPlayhead$(
        [linearSlider.changes$, circularSlider.changes$],
        controls.timeline$,
    ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const preset$ = controls.sketch$.pipe(
        map(({ formula }) => formulas[formula].source),
        distinctUntilChanged(),
    );

    const source$ = merge(preset$, editor.changes$);

    const compiled$ = compileFormula$(sketch.gl, source$).pipe(
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    // A source that will not compile is an error to show, not a blank canvas:
    // sketch$ simply does not emit, so combineLatest keeps the last shader.
    const sketch$ = compiled$.pipe(
        mergeMap(result => (result.ok ? of(result.sketch) : EMPTY)),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const error$ = compiled$.pipe(map(result => (result.ok ? null : result.message)));

    return merge(
        linearSlider.connect$(playhead$),
        circularSlider.connect$(playhead$),
        editor.connect$(preset$, error$),
        sketch.connect$(controls.sketch$, playhead$, sketch$),
        fpsCounter.connect$(playhead$),
    ).subscribe();
};

bootstrap();
