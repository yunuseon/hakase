import { combineLatest, merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksClocks } from '../components/clocks/clocks.component.ts';
import { clocksView } from '../components/clocks/clocks.ts';
import { wallClock$ } from '../lib/rx.ts';
import type { AppInput, Program } from '../program.ts';

export const clocksProgram: Program = {
    id: 'clocks',
    title: 'clocks',
    category: 'plan',
    icon: 'M12 3.5 A8.5 8.5 0 1 1 12 20.5 A8.5 8.5 0 1 1 12 3.5 M3.5 12 H20.5 M12 3.5 C8.5 7 8.5 17 12 20.5 M12 3.5 C15.5 7 15.5 17 12 20.5',
    size: { width: 300, height: 280 },
    minimum: { width: 220, height: 180 },
    launch: () => {
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
};
