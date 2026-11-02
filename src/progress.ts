import { EMPTY, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import type { Focus } from './components/focus/focus.ts';
import { focusView } from './components/focus/focus.ts';
import type { Progress } from './components/slider/slider.ts';
import type { Scrub } from './shared/playhead.ts';

export const focusProgress = (focus: Focus): Progress => ({
    access: 'read',
    at: focusView(focus).progress,
});

export type ProgressConnection = {
    readonly access: Progress['access'];
    readonly position$: Observable<number>;
};

export const progressScrubs$ = (
    progress$: Observable<ProgressConnection>,
    gestures$: Observable<Scrub>,
): Observable<Scrub> =>
    progress$.pipe(switchMap(({ access }) => (access === 'scrub' ? gestures$ : EMPTY)));
