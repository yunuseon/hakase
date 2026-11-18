import { declarations } from '../declarations.ts';
import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import type { AppInput, Program } from '../program.ts';

export const playheadProgram = {
    ...declarations.playhead,
    size: { width: 200, height: 244 },
    minimum: { width: 140, height: 170 },
    launch: async () => {
        const { HksCircularSlider } =
            await import('../components/slider/circular/circular-slider.component.ts');
        const dial = new HksCircularSlider();

        return {
            element: dial,
            run$: ({ playhead$ }) =>
                merge(
                    dial.connect$(playhead$).pipe(ignoreElements()),
                    dial.changes$.pipe(map((scrub): AppInput => ({ kind: 'scrub', ...scrub }))),
                ),
        };
    },
} satisfies Program;
