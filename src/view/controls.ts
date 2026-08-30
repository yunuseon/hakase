import { combineLatest, Observable } from 'rxjs';
import { shareReplay, startWith } from 'rxjs/operators';
import { Pane } from 'tweakpane';
import type { BindingParams, ContainerApi, TpChangeEvent } from '@tweakpane/core';
import { formulas } from '../model/formulas/registry.ts';
import {
    sketchParams,
    timelineParams,
    type SketchParams,
    type TimelineParams,
} from '../model/params.ts';

export interface Controls {
    readonly sketch$: Observable<SketchParams>;
    readonly timeline$: Observable<TimelineParams>;
    dispose(): void;
}

const bind$ = <O extends object, K extends keyof O & string>(
    container: ContainerApi,
    object: O,
    key: K,
    params?: BindingParams,
): Observable<O[K]> => {
    const api = container.addBinding(object, key, params);

    return new Observable<O[K]>(subscriber => {
        const listener = (event: TpChangeEvent<O[K]>) => {
            subscriber.next(event.value);
        };

        api.on('change', listener);

        return () => {
            // Not api.dispose() — that tears the row out of the panel.
            api.off('change', listener);
        };
    }).pipe(startWith(object[key]));
};

const formulaOptions: Record<string, string> = Object.fromEntries(
    Object.entries(formulas).map(([name, { label }]) => [label, name]),
);

export const createControls = (): Controls => {
    const pane = new Pane({ title: 'hakase' });

    const timeline$ = combineLatest({
        duration: bind$(pane, timelineParams, 'duration', { min: 0, max: 60, step: 0.1 }),
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    const dimension = pane.addFolder({ title: 'Dimension' });
    const sketch = pane.addFolder({ title: 'Sketch' });
    const colors = pane.addFolder({ title: 'Colors' });

    const sketch$ = combineLatest({
        height: bind$(dimension, sketchParams, 'height', { min: 64, max: 1280, step: 1 }),
        width: bind$(dimension, sketchParams, 'width', { min: 64, max: 1280, step: 1 }),

        formula: bind$(sketch, sketchParams, 'formula', { options: formulaOptions }),
        gapModifier: bind$(sketch, sketchParams, 'gapModifier', { min: 0.01, max: 1, step: 0.01 }),
        depthScalar: bind$(sketch, sketchParams, 'depthScalar', { min: 0.01, max: 2, step: 0.01 }),
        baseSize: bind$(sketch, sketchParams, 'baseSize', { min: 1, max: 20, step: 1 }),
        dimension: bind$(sketch, sketchParams, 'dimension', { min: 1, max: 128, step: 1 }),
        color1: bind$(colors, sketchParams, 'color1'),
        color2: bind$(colors, sketchParams, 'color2'),
        color3: bind$(colors, sketchParams, 'color3'),
        color4: bind$(colors, sketchParams, 'color4'),
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    return {
        sketch$,
        timeline$,
        dispose: () => {
            pane.dispose();
        },
    };
};
