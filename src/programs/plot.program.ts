import { declarations } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, shareReplay } from 'rxjs/operators';
import type { Trace } from '../components/plot/plot.ts';
import { plotInputs } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';
import { asPlot } from '../settings.ts';

const INPUTS = Object.keys(plotInputs);

export const plotProgram = {
    ...declarations.plot,
    size: { width: 440, height: 280 },
    minimum: { width: 260, height: 180 },
    launch: async () => {
        const { HksPlot } = await import('../components/plot/plot.component.ts');
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
