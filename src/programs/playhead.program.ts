import { progressInput } from '../inputs.ts';
import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import type { AppInput, Program } from '../program.ts';

export const playheadProgram = {
    id: 'playhead',
    inputs: { progress: progressInput },
    title: 'playhead',
    category: 'make',
    icon: 'M12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M12 12 L12 4.4',
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
