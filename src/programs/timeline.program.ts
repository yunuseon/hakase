import { combineLatest, merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksLinearSlider } from '../components/slider/linear/linear-slider.component.ts';
import { HksTransport } from '../components/transport/transport.component.ts';
import type { AppInput, Program } from '../program.ts';
import { elapsedLabel } from '../shared/playhead.ts';

export const timelineProgram: Program = {
    id: 'timeline',
    title: 'timeline',
    kind: 'floating',
    icon: 'M3 12 H21 M7.5 9.5 V14.5 M12 8 V16 M16.5 9.5 V14.5',
    size: { width: 340, height: 136 },
    launch: () => {
        const slider = new HksLinearSlider();
        const transport = new HksTransport();
        transport.slot = 'controls';
        slider.append(transport);

        return {
            element: slider,
            run$: ({ playhead$, playing$, looping$, duration$ }) => {
                const clock$ = combineLatest([playhead$, duration$]).pipe(
                    map(([at, duration]) => elapsedLabel(at, duration)),
                );

                return merge(
                    slider.connect$(playhead$).pipe(ignoreElements()),
                    transport
                        .connect$(playing$, looping$, clock$, duration$)
                        .pipe(ignoreElements()),
                    slider.changes$.pipe(map((at): AppInput => ({ kind: 'scrub', at }))),
                    transport.commands$.pipe(
                        map((command): AppInput => ({ kind: 'transport', command })),
                    ),
                    transport.durations$.pipe(
                        map((seconds): AppInput => ({ kind: 'duration', seconds })),
                    ),
                );
            },
        };
    },
};
