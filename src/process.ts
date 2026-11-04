import { defer, merge, type Observable } from 'rxjs';
import {
    filter,
    finalize,
    ignoreElements,
    map,
    withLatestFrom,
    startWith,
    distinctUntilChanged,
    shareReplay,
} from 'rxjs/operators';
import type {
    FollowGroup,
    StoreOption,
    SwitchGroup,
    WindowView,
} from './components/window/frame.ts';
import { HksWindow } from './components/window/window.component.ts';
import type { AppInput, AppState, ProcessId, Program, ProgramId, Self } from './program.ts';
import { storeInputCommand } from './input-connections.ts';
import type { PlaybackBinding } from './inputs.ts';
import type { WorkspaceAction } from './workspace.ts';

export type ProcessSignal =
    | { readonly to: 'workspace'; readonly action: WorkspaceAction }
    | { readonly to: 'state-mode'; readonly id: ProcessId }
    | { readonly to: 'state-busy'; readonly id: ProcessId; readonly busy: boolean }
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
    manage$: Observable<boolean>,
): Observable<ProcessSignal> =>
    defer(() => {
        const view = program.launch();
        const element = new HksWindow().label(program.title, program.icon);
        element.append(view.element);
        host.append(element);

        const menu$ = merge(manage$, element.menus$).pipe(
            startWith(false),
            distinctUntilChanged(),
            shareReplay({ bufferSize: 1, refCount: true }),
        );
        // Only a menu opened from state mode holds it open; one opened from the chip must not switch it on.
        const held$ = merge(manage$, element.menus$.pipe(filter(open => !open))).pipe(
            startWith(false),
            distinctUntilChanged(),
        );
        const view$ = self.slot$.pipe(
            map(({ frame, focused }): WindowView => ({ kind: 'floating', frame, focused })),
        );

        return merge(
            element.gestures$.pipe(
                withLatestFrom(self.store$, self.clock$),
                map(([gesture, store, clock]): ProcessSignal => {
                    const command = storeInputCommand(program.inputs, gesture);

                    return command === null
                        ? {
                              to: 'workspace',
                              action:
                                  gesture.kind === 'resize'
                                      ? { ...gesture, id: self.id, minimum: program.minimum }
                                      : { ...gesture, id: self.id },
                          }
                        : {
                              to: 'app',
                              from: self.id,
                              store,
                              clock,
                              program: program.id,
                              input: { kind: 'modulate', store, ...command },
                          };
                }),
            ),
            held$.pipe(map((busy): ProcessSignal => ({ to: 'state-busy', id: self.id, busy }))),
            element.stateModes$.pipe(map((): ProcessSignal => ({ to: 'state-mode', id: self.id }))),
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
            element.connect$(view$, stores$, programs$, follows$, menu$).pipe(ignoreElements()),
        ).pipe(
            finalize(() => {
                element.remove();
            }),
        );
    });
