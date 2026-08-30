import { combineLatest, Observable } from 'rxjs';
import { distinctUntilChanged, shareReplay, startWith } from 'rxjs/operators';
import { Pane } from 'tweakpane';
import type { BindingParams, ContainerApi, TpChangeEvent } from '@tweakpane/core';
import { formulas, type FormulaName } from './components/sketch/formulas/registry.ts';
import type { ProgramId } from './program.ts';
import {
    sketchParams,
    timelineParams,
    type PanelParams,
    type TimelineParams,
} from './shared/params.ts';

export interface Controls {
    readonly windows$: Observable<ProgramVisibility>;
    readonly formula$: Observable<FormulaName>;
    readonly sketch$: Observable<PanelParams>;
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

export type ProgramVisibility = Record<ProgramId, boolean>;

const openByDefault: ProgramVisibility = {
    formula: true,
    sketch: true,
    timeline: true,
    playhead: true,
};

const formulaOptions: Record<string, string> = Object.fromEntries(
    Object.entries(formulas).map(([name, { label }]) => [label, name]),
);

export const createControls = (container: HTMLElement): Controls => {
    const pane = new Pane({ container, title: 'hakase', expanded: false });

    const timeline$ = combineLatest({
        duration: bind$(pane, timelineParams, 'duration', { min: 0, max: 60, step: 0.1 }),
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));
    const sketch = pane.addFolder({ title: 'Sketch' });
    const colors = pane.addFolder({ title: 'Colors' });

    const formula$ = bind$(sketch, sketchParams, 'formula', { options: formulaOptions }).pipe(
        distinctUntilChanged(),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const sketch$ = combineLatest({
        gapModifier: bind$(sketch, sketchParams, 'gapModifier', { min: 0.01, max: 1, step: 0.01 }),
        depthScalar: bind$(sketch, sketchParams, 'depthScalar', { min: 0.01, max: 2, step: 0.01 }),
        baseSize: bind$(sketch, sketchParams, 'baseSize', { min: 1, max: 20, step: 1 }),
        dimension: bind$(sketch, sketchParams, 'dimension', { min: 1, max: 128, step: 1 }),
        color1: bind$(colors, sketchParams, 'color1'),
        color2: bind$(colors, sketchParams, 'color2'),
        color3: bind$(colors, sketchParams, 'color3'),
        color4: bind$(colors, sketchParams, 'color4'),
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const windows = pane.addFolder({ title: 'Windows', expanded: false });

    // Every ProgramId must appear here; the Controls return type is what checks that.
    const windows$ = combineLatest({
        formula: bind$(windows, openByDefault, 'formula'),
        sketch: bind$(windows, openByDefault, 'sketch'),
        timeline: bind$(windows, openByDefault, 'timeline'),
        playhead: bind$(windows, openByDefault, 'playhead'),
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    return {
        windows$,
        formula$,
        sketch$,
        timeline$,
        dispose: () => {
            pane.dispose();
        },
    };
};
