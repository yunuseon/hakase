import { merge } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import './styles.css';
import { requireElementById } from './lib/dom.ts';
import { createPlayhead$ } from './model/playhead.ts';
import { createCircularSlider } from './view/circular-slider.ts';
import { createControls } from './view/controls.ts';
import { createFpsCounter } from './view/fps-counter.ts';
import { createLinearSlider } from './view/linear-slider.ts';
import { createSketchView } from './view/sketch.ts';

const bootstrap = () => {
    const container = requireElementById('canvas-container');

    const linearSlider = createLinearSlider('slider');
    const circularSlider = createCircularSlider('circle-slider', 'circle-indicator');
    const controls = createControls();
    const sketch = createSketchView(container);
    const fpsCounter = createFpsCounter(container);

    const playhead$ = createPlayhead$(
        [linearSlider.changes$, circularSlider.changes$],
        controls.timeline$,
    ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    return merge(
        linearSlider.connect$(playhead$),
        circularSlider.connect$(playhead$),
        sketch.connect$(controls.sketch$, playhead$),
        fpsCounter.connect$(playhead$),
    ).subscribe();
};

bootstrap();
