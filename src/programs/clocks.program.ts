import { declarations } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { clocksView } from '../model/clocks.ts';
import { wallClock$ } from '../lib/rx.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';

export const clocksProgram = {
    ...declarations.clocks,
    size: { width: 300, height: 280 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const { HksClocks } = await import('../components/clocks/clocks.component.ts');
        const clocks = new HksClocks();
        const local = Intl.DateTimeFormat().resolvedOptions().timeZone;

        return {
            element: clocks,
            run$: ({ clocks$ }) =>
                merge(
                    clocks
                        .connect$(
                            combineLatest([clocks$, wallClock$]).pipe(
                                map(([{ zones }, ms]) => clocksView(zones, ms, local)),
                            ),
                            Intl.supportedValuesOf('timeZone'),
                        )
                        .pipe(ignoreElements()),
                    clocks.commands$.pipe(map((command): AppInput => ({ kind: 'clock', command }))),
                ),
        };
    },
} satisfies Program;
