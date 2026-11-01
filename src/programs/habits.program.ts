import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map } from 'rxjs/operators';
import { HksHabits } from '../components/habits/habits.component.ts';
import { habitsView } from '../components/habits/habits.ts';
import { dayOf, shortDayLabel } from '../lib/day.ts';
import { wallClock$ } from '../lib/rx.ts';
import type { AppInput, Program } from '../program.ts';

export const habitsProgram: Program = {
    id: 'habits',
    title: 'habits',
    category: 'plan',
    icon: 'M4 5 H8 V9 H4 Z M10 5 H14 V9 H10 Z M16 5 H20 V9 H16 Z M4 11 H8 V15 H4 Z M10 11 H14 V15 H10 Z M4 17 H8 V21 H4 Z',
    size: { width: 460, height: 260 },
    minimum: { width: 260, height: 180 },
    launch: () => {
        const habits = new HksHabits();

        return {
            element: habits,
            run$: ({ habits$ }) =>
                merge(
                    habits
                        .connect$(
                            combineLatest([
                                habits$,
                                wallClock$.pipe(map(dayOf), distinctUntilChanged()),
                            ]).pipe(
                                map(([state, today]) =>
                                    habitsView(state, today, day => shortDayLabel(day)),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    habits.commands$.pipe(map((command): AppInput => ({ kind: 'habit', command }))),
                ),
        };
    },
};
