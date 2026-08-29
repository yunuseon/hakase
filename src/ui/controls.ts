import { BehaviorSubject, type Observable } from 'rxjs';
import { scan } from 'rxjs/operators';
import { Pane } from 'tweakpane';
import {
    sketchParams,
    timelineParams,
    type SketchParams,
    type TimelineParams,
} from '../sketch/params.ts';

export interface Controls {
    readonly sketch$: Observable<SketchParams>;
    readonly timeline$: Observable<TimelineParams>;
    dispose(): void;
}

/** Turns a params object into a stream of complete, patched snapshots. */
const createParamStream = <T extends object>(defaults: T) => {
    const patches = new BehaviorSubject<Partial<T>>({});

    return {
        values$: patches.pipe(scan((acc: T, patch) => ({ ...acc, ...patch }), defaults)),
        set: <K extends keyof T>(key: K, value: T[K]) => {
            const patch: Partial<T> = {};
            patch[key] = value;
            patches.next(patch);
        },
    };
};

export const createControls = (): Controls => {
    const sketch = createParamStream(sketchParams);
    const timeline = createParamStream(timelineParams);

    const pane = new Pane({ title: 'hakase' });

    pane.addBinding(timelineParams, 'duration', { min: 0, max: 60, step: 0.1 }).on(
        'change',
        ({ value }) => timeline.set('duration', value),
    );

    const dimensionFolder = pane.addFolder({ title: 'Dimension' });
    dimensionFolder
        .addBinding(sketchParams, 'height', { min: 64, max: 1280, step: 1 })
        .on('change', ({ value }) => sketch.set('height', value));
    dimensionFolder
        .addBinding(sketchParams, 'width', { min: 64, max: 1280, step: 1 })
        .on('change', ({ value }) => sketch.set('width', value));

    const sketchFolder = pane.addFolder({ title: 'Sketch' });
    sketchFolder
        .addBinding(sketchParams, 'gapModifier', { min: 0.01, max: 1, step: 0.01 })
        .on('change', ({ value }) => sketch.set('gapModifier', value));
    sketchFolder
        .addBinding(sketchParams, 'depthScalar', { min: 0.01, max: 2, step: 0.01 })
        .on('change', ({ value }) => sketch.set('depthScalar', value));
    sketchFolder
        .addBinding(sketchParams, 'baseSize', { min: 1, max: 20, step: 1 })
        .on('change', ({ value }) => sketch.set('baseSize', value));
    sketchFolder
        .addBinding(sketchParams, 'dimension', { min: 1, max: 128, step: 1 })
        .on('change', ({ value }) => sketch.set('dimension', value));

    const colorFolder = pane.addFolder({ title: 'Colors' });
    for (const key of ['color1', 'color2', 'color3', 'color4'] as const) {
        colorFolder
            .addBinding(sketchParams, key)
            .on('change', ({ value }) => sketch.set(key, value));
    }

    return {
        sketch$: sketch.values$,
        timeline$: timeline.values$,
        dispose: () => pane.dispose(),
    };
};
