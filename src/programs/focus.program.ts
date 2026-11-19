import { declarations } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, mergeMap, shareReplay } from 'rxjs/operators';
import { focusCommandOf, focusSections } from '../components/focus/focus-controls.ts';
import { focusView } from '../model/focus.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';

export const focusProgram = {
    ...declarations.focus,
    size: { width: 260, height: 340 },
    minimum: { width: 200, height: 260 },
    launch: async () => {
        const [{ HksFocus }, { HksProperties }] = await Promise.all([
            import('../components/focus/focus.component.ts'),
            import('../shared/ui/properties.component.ts'),
        ]);
        const focus = new HksFocus();
        const properties = new HksProperties();
        properties.slot = 'controls';
        focus.append(properties);

        return {
            element: focus,
            run$: ({ focus$, plan$ }) => {
                const view$ = combineLatest([focus$, plan$]).pipe(
                    map(([timer, plan]) => focusView(timer, plan)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    focus.connect$(view$).pipe(ignoreElements()),
                    properties
                        .connect$(
                            view$.pipe(
                                map(({ lengths }) => lengths),
                                distinctUntilChanged(),
                                map(focusSections),
                            ),
                        )
                        .pipe(ignoreElements()),
                    merge(focus.commands$, properties.changes$.pipe(mergeMap(focusCommandOf))).pipe(
                        map((command): AppInput => ({ kind: 'focus', command })),
                    ),
                );
            },
        };
    },
} satisfies Program;
