import { combineLatest, defer, EMPTY, from, merge, type Observable } from 'rxjs';
import {
    filter,
    finalize,
    ignoreElements,
    map,
    withLatestFrom,
    startWith,
    distinctUntilChanged,
    shareReplay,
    take,
    takeUntil,
    switchMap,
    tap,
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
    | { readonly to: 'toggle-selection'; readonly id: ProcessId }
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

export type AppSignal = Extract<ProcessSignal, { readonly to: 'app' }>;

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
    selected$: Observable<boolean>,
    closing$: Observable<unknown> = EMPTY,
): Observable<ProcessSignal> =>
    defer(() => {
        const element = new HksWindow().label(program.title, program.icon);
        host.append(element);
        const removed$ = closing$.pipe(take(1), shareReplay({ bufferSize: 1, refCount: true }));

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
        const view$ = combineLatest([self.slot$, selected$]).pipe(
            map(([{ frame, focused }, selected]): WindowView => ({
                kind: 'floating',
                frame,
                focused,
                selected,
            })),
        );

        const signals$ = merge(
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
            element.selectionToggles$.pipe(
                map((): ProcessSignal => ({ to: 'toggle-selection', id: self.id })),
            ),
            from(program.launch()).pipe(
                tap(view => {
                    element.append(view.element);
                }),
                switchMap(view => view.run$(state, self)),
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
        ).pipe(
            withLatestFrom(
                removed$.pipe(
                    map(() => true),
                    startWith(false),
                ),
            ),
            filter(([, removed]) => !removed),
            map(([signal]) => signal),
        );

        return merge(
            signals$,
            element.connect$(view$, stores$, programs$, follows$, menu$).pipe(ignoreElements()),
        ).pipe(
            takeUntil(removed$.pipe(switchMap(() => element.disappear$()))),
            finalize(() => {
                element.remove();
            }),
        );
    });
