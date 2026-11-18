import { declarations } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map } from 'rxjs/operators';
import { habitsView } from '../components/habits/habits.ts';
import { dayOf, shortDayLabel } from '../lib/day.ts';
import { wallClock$ } from '../lib/rx.ts';
import type { AppInput, Program } from '../program.ts';

export const habitsProgram = {
    ...declarations.habits,
    size: { width: 460, height: 260 },
    minimum: { width: 260, height: 180 },
    launch: async () => {
        const { HksHabits } = await import('../components/habits/habits.component.ts');
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
} satisfies Program;
