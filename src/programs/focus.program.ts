import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksFocus } from '../components/focus/focus.component.ts';
import { focusView } from '../components/focus/focus.ts';
import type { AppInput, Program } from '../program.ts';

export const focusProgram: Program = {
    id: 'focus',
    title: 'focus',
    icon: 'M12 5 A7.5 7.5 0 1 1 12 20 A7.5 7.5 0 1 1 12 5 M12 9 V12.5 L14.5 14.5 M10 2.5 H14',
    size: { width: 260, height: 340 },
    minimum: { width: 200, height: 260 },
    launch: () => {
        const focus = new HksFocus();

        return {
            element: focus,
            run$: ({ focus$ }) =>
                merge(
                    focus.connect$(focus$.pipe(map(focusView))).pipe(ignoreElements()),
                    focus.commands$.pipe(map((command): AppInput => ({ kind: 'focus', command }))),
                ),
        };
    },
};
