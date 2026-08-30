import { defer, merge, type Observable } from 'rxjs';
import { finalize, ignoreElements, map } from 'rxjs/operators';
import type { WindowView } from './components/window/frame.ts';
import { HksWindow } from './components/window/window.component.ts';
import type { LayoutAction } from './layout.ts';
import type { AppState, Program } from './program.ts';

// The window lives exactly as long as this subscription: defer mounts, finalize removes.
export const liveWindow$ = (program: Program, state: AppState): Observable<LayoutAction> =>
    defer(() => {
        const element = new HksWindow().label(program.title);
        element.append(program.content);
        document.body.append(element);

        const view$ = state
            .frame$(program.id)
            .pipe(map((frame): WindowView => ({ kind: program.kind, frame })));

        return merge(
            element.gestures$.pipe(
                map((gesture): LayoutAction => ({ ...gesture, id: program.id })),
            ),
            element.connect$(view$).pipe(ignoreElements()),
            program.connect$(state).pipe(ignoreElements()),
        ).pipe(
            finalize(() => {
                element.remove();
            }),
        );
    });
