import { defer, merge, type Observable } from 'rxjs';
import { finalize, ignoreElements, map, withLatestFrom } from 'rxjs/operators';
import type { WindowView } from './components/window/frame.ts';
import { HksWindow } from './components/window/window.component.ts';
import type { AppInput, AppState, ProcessId, Program, ProgramId, Self } from './program.ts';
import type { WorkspaceAction } from './workspace.ts';

export type ProcessSignal =
    | { readonly to: 'workspace'; readonly action: WorkspaceAction }
    // Stamped here so a process can tell its own edits from everyone else's.
    | {
          readonly to: 'app';
          readonly from: ProcessId;
          // Stamped as the input leaves, so a rebind takes effect from the next one.
          readonly store: string;
          readonly program: ProgramId;
          readonly input: AppInput;
      };

// Two subscriptions mean two processes: defer launches and opens, finalize closes.
export const liveProcess$ = (
    program: Program,
    self: Self,
    state: AppState,
    host: HTMLElement,
): Observable<ProcessSignal> =>
    defer(() => {
        const view = program.launch();
        const element = new HksWindow().label(program.title, program.icon);
        element.append(view.element);
        host.append(element);

        const view$ = self.slot$.pipe(
            map(({ frame, focused }): WindowView => ({ kind: 'floating', frame, focused })),
        );

        return merge(
            element.gestures$.pipe(
                map((gesture): ProcessSignal => ({
                    to: 'workspace',
                    action:
                        gesture.kind === 'resize'
                            ? { ...gesture, id: self.id, minimum: program.minimum }
                            : { ...gesture, id: self.id },
                })),
            ),
            view.run$(state, self).pipe(
                withLatestFrom(self.store$),
                map(([input, store]): ProcessSignal => ({
                    to: 'app',
                    from: self.id,
                    store,
                    program: program.id,
                    input,
                })),
            ),
            element.connect$(view$).pipe(ignoreElements()),
        ).pipe(
            finalize(() => {
                element.remove();
            }),
        );
    });
