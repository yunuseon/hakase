import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, shareReplay } from 'rxjs/operators';
import { HksPlot } from '../components/plot/plot.component.ts';
import type { Trace } from '../components/plot/plot.ts';
import { playbackInput, plotInputs } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';
import { asPlot } from '../settings.ts';

const INPUTS = Object.keys(plotInputs);

export const plotProgram = {
    id: 'plot',
    inputs: { playback: playbackInput, ...plotInputs },
    title: 'plot',
    category: 'make',
    icon: 'M4 4 V20 H20 M7 15 C10 5, 12 5, 14 11 S 18 18, 20 8',
    size: { width: 440, height: 280 },
    minimum: { width: 260, height: 180 },
    launch: () => {
        const plot = new HksPlot();

        return {
            element: plot,
            run$: ({ followedLevel$, playhead$ }, self) => {
                const traces$ = combineLatest(
                    INPUTS.map(input =>
                        followedLevel$(input).pipe(
                            map((followed): Trace[] =>
                                followed === null
                                    ? []
                                    : [
                                          {
                                              key: input,
                                              label: followed.name,
                                              colour: followed.colour,
                                              driver: followed.driver,
                                          },
                                      ],
                            ),
                        ),
                    ),
                ).pipe(
                    map(all => all.flat()),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const layout$ = self.settings$.pipe(
                    map(settings => asPlot(settings).layout),
                    distinctUntilChanged(),
                );

                return merge(
                    plot.connect$(traces$, layout$, playhead$).pipe(ignoreElements()),
                    plot.layouts$.pipe(
                        map((layout): AppInput => ({
                            kind: 'settings',
                            settings: { kind: 'plot', layout },
                        })),
                    ),
                    plot.scrubs$.pipe(map((scrub): AppInput => ({ kind: 'scrub', ...scrub }))),
                );
            },
        };
    },
} satisfies Program;
