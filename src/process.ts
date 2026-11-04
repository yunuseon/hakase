import { defer, merge, type Observable } from 'rxjs';
import { finalize, ignoreElements, map, withLatestFrom } from 'rxjs/operators';
import type {
    FollowGroup,
    StoreOption,
    SwitchGroup,
    WindowView,
} from './components/window/frame.ts';
import { HksWindow } from './components/window/window.component.ts';
import type { AppInput, AppState, ProcessId, Program, ProgramId, Self } from './program.ts';
import type { PlaybackBinding } from './inputs.ts';
import type { WorkspaceAction } from './workspace.ts';

export type ProcessSignal =
    | { readonly to: 'workspace'; readonly action: WorkspaceAction }
    // Apart from the workspace's actions: an open menu is neither saved nor a step to undo.
    | { readonly to: 'peek'; readonly id: ProcessId; readonly open: boolean }
    // Stamped here so a process can tell its own edits from everyone else's.
    | {
          readonly to: 'app';
          readonly from: ProcessId;
          // Stamped as the input leaves, so a rebind takes effect from the next one.
          readonly store: string;
          readonly clock: PlaybackBinding | null;
          readonly program: ProgramId;
          readonly input: AppInput;
      };

// Two subscriptions mean two processes: defer launches and opens, finalize closes.
export const liveProcess$ = (
    program: Program,
    self: Self,
    state: AppState,
    host: HTMLElement,
    stores$: Observable<readonly StoreOption[] | null>,
    programs$: Observable<readonly SwitchGroup[]>,
    follows$: Observable<readonly FollowGroup[] | null>,
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
            element.peeks$.pipe(map((open): ProcessSignal => ({ to: 'peek', id: self.id, open }))),
            view.run$(state, self).pipe(
                withLatestFrom(self.store$, self.clock$),
                map(([input, store, clock]): ProcessSignal => ({
                    to: 'app',
                    from: self.id,
                    store,
                    clock,
                    program: program.id,
                    input,
                })),
            ),
            element.connect$(view$, stores$, programs$, follows$).pipe(ignoreElements()),
        ).pipe(
            finalize(() => {
                element.remove();
            }),
        );
    });
