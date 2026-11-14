import { ownPlaybackInput } from '../inputs.ts';
import { combineLatest, merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import type { AppInput, Program } from '../program.ts';
import { elapsedLabel, timeOfDayLabel } from '../shared/playhead.ts';

export const timelineProgram = {
    id: 'timeline',
    inputs: { playback: ownPlaybackInput },
    title: 'timeline',
    category: 'make',
    icon: 'M3 12 H21 M7.5 9.5 V14.5 M12 8 V16 M16.5 9.5 V14.5',
    size: { width: 340, height: 136 },
    minimum: { width: 240, height: 110 },
    launch: async () => {
        const [{ HksLinearSlider }, { HksTransport }] = await Promise.all([
            import('../components/slider/linear/linear-slider.component.ts'),
            import('../components/transport/transport.component.ts'),
        ]);
        const slider = new HksLinearSlider();
        const transport = new HksTransport();
        transport.slot = 'controls';
        slider.append(transport);

        return {
            element: slider,
            run$: ({ playhead$, playing$, looping$, duration$, ticks$, clock$: now$ }) => {
                const day$ = now$.pipe(map(({ day }) => day));
                const clock$ = combineLatest([playhead$, duration$, day$]).pipe(
                    map(([at, duration, day]) =>
                        day ? timeOfDayLabel(at) : elapsedLabel(at, duration),
                    ),
                );

                return merge(
                    slider.connect$(playhead$).pipe(ignoreElements()),
                    transport
                        .connect$(playing$, looping$, clock$, duration$, ticks$, day$)
                        .pipe(ignoreElements()),
                    slider.changes$.pipe(map((scrub): AppInput => ({ kind: 'scrub', ...scrub }))),
                    transport.commands$.pipe(
                        map((command): AppInput => ({ kind: 'transport', command })),
                    ),
                    transport.days$.pipe(map((): AppInput => ({ kind: 'day' }))),
                    transport.ticks$.pipe(map((count): AppInput => ({ kind: 'ticks', count }))),
                    transport.durations$.pipe(
                        map((seconds): AppInput => ({ kind: 'duration', seconds })),
                    ),
                );
            },
        };
    },
} satisfies Program;
