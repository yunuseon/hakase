import { defer, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    finalize,
    ignoreElements,
    map,
    mergeMap,
    switchMap,
} from 'rxjs/operators';
import type { WindowGesture, WindowView } from './components/window/frame.ts';
import { HksWindow } from './components/window/window.component.ts';
import type { ToolbarState } from './workspace.ts';

export const toolbarHost$ = (
    toolbar: HTMLElement,
    canvas: HTMLElement,
    state$: Observable<ToolbarState>,
): Observable<WindowGesture> =>
    state$.pipe(
        map(state => state.kind),
        distinctUntilChanged(),
        switchMap(kind =>
            kind === 'docked'
                ? EMPTY
                : defer(() => {
                      const frame = new HksWindow().label('tools', null);
                      frame.slot = 'chrome';
                      toolbar.removeAttribute('slot');
                      frame.append(toolbar);
                      canvas.append(frame);

                      const view$ = state$.pipe(
                          mergeMap((state): Observable<WindowView> =>
                              state.kind === 'floating'
                                  ? of({ kind: 'fitted', frame: state.frame, focused: false })
                                  : EMPTY,
                          ),
                      );

                      return merge(
                          frame.gestures$,
                          frame.connect$(view$).pipe(ignoreElements()),
                      ).pipe(
                          finalize(() => {
                              // Moved, not rebuilt: the toolbar keeps its listeners across the trip.
                              toolbar.slot = 'chrome';
                              canvas.append(toolbar);
                              frame.remove();
                          }),
                      );
                  }),
        ),
    );
