import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, map, shareReplay, tap } from 'rxjs/operators';
import './styles.css';
import { requireElementById } from './lib/dom.ts';
import { devicePixelRatio$, shallowEqual } from './lib/rx.ts';
import { createPlayhead$ } from './playhead.ts';
import { applyGeometry, createSurface } from './sketch/canvas.ts';
import { renderSketch } from './sketch/render.ts';
import { createCircularSlider } from './ui/circular-slider.ts';
import { createControls } from './ui/controls.ts';
import { reportFps$ } from './ui/fps-counter.ts';
import { createLinearSlider } from './ui/linear-slider.ts';

const bootstrap = () => {
    const container = requireElementById('canvas-container');
    const surface = createSurface(container);

    const linearSlider = createLinearSlider('slider');
    const circularSlider = createCircularSlider('circle-slider', 'circle-indicator');
    const controls = createControls();

    const playhead$ = createPlayhead$(
        [linearSlider.changes$, circularSlider.changes$],
        controls.timeline$,
    ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const surface$ = combineLatest([controls.sketch$, devicePixelRatio$]).pipe(
        map(([{ width, height }, ratio]) => ({ width, height, ratio })),
        distinctUntilChanged(shallowEqual),
        tap(geometry => {
            applyGeometry(surface, geometry);
        }),
    );

    // surface$ is a dependency, not a step: applying geometry clears the canvas,
    // so every resize has to force a redraw.
    const sketch$ = combineLatest([controls.sketch$, playhead$, surface$]).pipe(
        tap(([params, playhead]) => {
            renderSketch(surface.context, params, playhead);
        }),
    );

    return merge(
        linearSlider.connect$(playhead$),
        circularSlider.connect$(playhead$),
        sketch$,
        playhead$.pipe(reportFps$(container)),
    ).subscribe();
};

bootstrap();
