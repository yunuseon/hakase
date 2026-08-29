import { combineLatest } from 'rxjs';
import { shareReplay, tap } from 'rxjs/operators';
import './styles.css';
import { requireElementById } from './lib/dom.ts';
import { createPlayhead$ } from './playhead.ts';
import { createSurface } from './sketch/canvas.ts';
import { renderSketch } from './sketch/render.ts';
import { createCircularSlider } from './ui/circular-slider.ts';
import { createControls } from './ui/controls.ts';
import { reportFps } from './ui/fps-counter.ts';
import { createLinearSlider } from './ui/linear-slider.ts';

const bootstrap = (): void => {
    const container = requireElementById('canvas-container');
    const surface = createSurface(container);

    const linearSlider = createLinearSlider('slider');
    const circularSlider = createCircularSlider('circle-slider', 'circle-indicator');

    const controls = createControls();

    const playhead$ = createPlayhead$(
        [linearSlider.changes$, circularSlider.changes$],
        controls.timeline$,
    ).pipe(
        tap(value => {
            linearSlider.render(value);
            circularSlider.render(value);
        }),
        // Shared so the fps counter and the renderer observe the same frames.
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    playhead$.pipe(reportFps(container)).subscribe();

    combineLatest([controls.sketch$, playhead$]).subscribe(([params, playhead]) => {
        surface.resize(params.width, params.height);
        renderSketch(surface.context, params, playhead);
    });
};

bootstrap();
