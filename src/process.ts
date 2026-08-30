import { defer, merge, type Observable } from 'rxjs';
import { finalize, ignoreElements, map } from 'rxjs/operators';
import type { WindowView } from './components/window/frame.ts';
import { HksWindow } from './components/window/window.component.ts';
import type { DesktopAction } from './desktop.ts';
import type { AppInput, AppState, Program, Self } from './program.ts';

export type ProcessSignal =
    | { readonly to: 'desktop'; readonly action: DesktopAction }
    | { readonly to: 'app'; readonly input: AppInput };

// Two subscriptions mean two processes: defer launches and opens, finalize closes.
export const liveProcess$ = (
    program: Program,
    self: Self,
    state: AppState,
): Observable<ProcessSignal> =>
    defer(() => {
        const view = program.launch();
        const element = new HksWindow().label(program.title);
        element.append(view.element);
        document.body.append(element);

        const view$ = self.frame$.pipe(map((frame): WindowView => ({ kind: program.kind, frame })));

        return merge(
            element.gestures$.pipe(
                map((gesture): ProcessSignal => ({
                    to: 'desktop',
                    action: { ...gesture, id: self.id },
                })),
            ),
            view.run$(state, self).pipe(map((input): ProcessSignal => ({ to: 'app', input }))),
            element.connect$(view$).pipe(ignoreElements()),
        ).pipe(
            finalize(() => {
                element.remove();
            }),
        );
    });
