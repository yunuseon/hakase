import { declarations } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { focusView } from '../components/focus/focus.ts';
import type { AppInput, Program } from '../program.ts';

export const focusProgram = {
    ...declarations.focus,
    size: { width: 260, height: 340 },
    minimum: { width: 200, height: 260 },
    launch: async () => {
        const { HksFocus } = await import('../components/focus/focus.component.ts');
        const focus = new HksFocus();

        return {
            element: focus,
            run$: ({ focus$, plan$ }) =>
                merge(
                    focus
                        .connect$(
                            combineLatest([focus$, plan$]).pipe(
                                map(([timer, plan]) => focusView(timer, plan)),
                            ),
                        )
                        .pipe(ignoreElements()),
                    focus.commands$.pipe(map((command): AppInput => ({ kind: 'focus', command }))),
                ),
        };
    },
} satisfies Program;
