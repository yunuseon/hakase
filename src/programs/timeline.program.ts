import { combineLatest, merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksLinearSlider } from '../components/slider/linear/linear-slider.component.ts';
import { HksTransport } from '../components/transport/transport.component.ts';
import type { AppInput, Program } from '../program.ts';
import { clockLabel } from '../shared/playhead.ts';

export const timelineProgram: Program = {
    id: 'timeline',
    title: 'timeline',
    kind: 'floating',
    icon: 'M3 12 H21 M7.5 9.5 V14.5 M12 8 V16 M16.5 9.5 V14.5',
    size: { width: 320, height: 108 },
    launch: () => {
        const slider = new HksLinearSlider();
        const transport = new HksTransport();
        transport.slot = 'controls';
        slider.append(transport);

        return {
            element: slider,
            run$: ({ playhead$, playing$, duration$ }) => {
                const clock$ = combineLatest([playhead$, duration$]).pipe(
                    map(([at, duration]) => clockLabel(at, duration)),
                );

                return merge(
                    slider.connect$(playhead$).pipe(ignoreElements()),
                    transport.connect$(playing$, clock$).pipe(ignoreElements()),
                    slider.changes$.pipe(map((at): AppInput => ({ kind: 'scrub', at }))),
                    transport.commands$.pipe(
                        map((command): AppInput => ({ kind: 'transport', command })),
                    ),
                );
            },
        };
    },
};
