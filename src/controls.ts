import { combineLatest, Observable } from 'rxjs';
import { shareReplay, startWith } from 'rxjs/operators';
import { Pane } from 'tweakpane';
import type { BindingParams, ContainerApi, TpChangeEvent } from '@tweakpane/core';

export const timelineParams = {
    duration: 8,
};

export type TimelineParams = typeof timelineParams;

export interface Controls {
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

export const createControls = (container: HTMLElement): Controls => {
    const pane = new Pane({ container, title: 'hakase', expanded: false });

    const timeline$ = combineLatest({
        duration: bind$(pane, timelineParams, 'duration', { min: 0, max: 60, step: 0.1 }),
    }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

    return {
        timeline$,
        dispose: () => {
            pane.dispose();
        },
    };
};
