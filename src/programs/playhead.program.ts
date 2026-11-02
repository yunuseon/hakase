import { progressInput } from '../inputs.ts';
import { merge } from 'rxjs';
import { ignoreElements, map, switchMap } from 'rxjs/operators';
import { HksCircularSlider } from '../components/slider/circular/circular-slider.component.ts';
import { progressScrubs$ } from '../progress.ts';
import type { Progress } from '../components/slider/slider.ts';
import type { AppInput, Program } from '../program.ts';

export const playheadProgram = {
    id: 'playhead',
    inputs: { progress: progressInput },
    title: 'playhead',
    category: 'make',
    icon: 'M12 12 m -8 0 a 8 8 0 1 0 16 0 a 8 8 0 1 0 -16 0 M12 12 L12 4.4',
    size: { width: 200, height: 244 },
    minimum: { width: 140, height: 170 },
    launch: () => {
        const dial = new HksCircularSlider();

        return {
            element: dial,
            run$: ({ progress$ }) =>
                merge(
                    dial
                        .connect$(
                            progress$.pipe(
                                switchMap(({ access, position$ }) =>
                                    position$.pipe(map((at): Progress => ({ access, at }))),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    progressScrubs$(progress$, dial.changes$).pipe(
                        map((scrub): AppInput => ({ kind: 'scrub', ...scrub })),
                    ),
                ),
        };
    },
} satisfies Program;
