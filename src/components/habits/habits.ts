import { isDay, shiftDay, type Day } from '../../lib/day.ts';

export type Habit = {
    readonly id: string;
    readonly name: string;
    readonly done: readonly Day[];
};

export type Habits = {
    readonly items: readonly Habit[];
    readonly made: number;
};

export type HabitCommand =
    | { readonly kind: 'add'; readonly name: string }
    | { readonly kind: 'rename'; readonly id: string; readonly name: string }
    | { readonly kind: 'remove'; readonly id: string }
    | { readonly kind: 'toggle'; readonly id: string; readonly day: Day };

export const emptyHabits: Habits = { items: [], made: 0 };

const numberOf = (id: string): number => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

export const reduceHabits = (habits: Habits, command: HabitCommand): Habits => {
    switch (command.kind) {
        case 'add': {
            const name = command.name.trim();
            const made = habits.made + 1;

            return name === ''
                ? habits
                : { made, items: [...habits.items, { id: `habit-${made}`, name, done: [] }] };
        }
        case 'rename': {
            const name = command.name.trim();

            return name === ''
                ? habits
                : {
                      ...habits,
                      items: habits.items.map(habit =>
                          habit.id === command.id ? { ...habit, name } : habit,
                      ),
                  };
        }
        case 'remove':
            return { ...habits, items: habits.items.filter(({ id }) => id !== command.id) };
        case 'toggle':
            return {
                ...habits,
                items: habits.items.map(habit =>
                    habit.id !== command.id
                        ? habit
                        : {
                              ...habit,
                              done: habit.done.includes(command.day)
                                  ? habit.done.filter(day => day !== command.day)
                                  : [...habit.done, command.day].sort(),
                          },
                ),
            };
    }
};

export const daysUpTo = (today: Day, count: number): readonly Day[] =>
    Array.from({ length: count }, (_, index) => shiftDay(today, index - count + 1));

// Today not yet ticked does not break a streak: the day is not over.
export const streakOf = (done: readonly Day[], today: Day): number => {
    const ticked = new Set(done);
    const from = ticked.has(today) ? today : shiftDay(today, -1);
    const count = (day: Day, total: number): number =>
        ticked.has(day) ? count(shiftDay(day, -1), total + 1) : total;

    return count(from, 0);
};

const habitFrom = (value: unknown): Habit | null => {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('id' in value && 'name' in value && 'done' in value)
    ) {
        return null;
    }

    const { id, name, done } = value;

    return typeof id === 'string' && typeof name === 'string' && Array.isArray(done)
        ? {
              id,
              name,
              done: [
                  ...new Set(
                      done.filter((day): day is string => typeof day === 'string' && isDay(day)),
                  ),
              ].sort(),
          }
        : null;
};

export const parseHabits = (value: unknown): Habits => {
    if (typeof value !== 'object' || value === null || !('items' in value && 'made' in value)) {
        return emptyHabits;
    }

    const { items, made } = value;

    if (!Array.isArray(items) || typeof made !== 'number' || !Number.isInteger(made)) {
        return emptyHabits;
    }

    const kept = items.map(habitFrom).filter(habit => habit !== null);

    return { items: kept, made: Math.max(made, 0, ...kept.map(({ id }) => numberOf(id))) };
};

export const WINDOW_DAYS = 21;

export type HabitColumn = {
    readonly day: Day;
    readonly weekday: string;
    readonly date: string;
    readonly today: boolean;
};

export type HabitRow = {
    readonly id: string;
    readonly name: string;
    readonly cells: readonly boolean[];
    readonly streak: number;
};

export type HabitsView = {
    readonly columns: readonly HabitColumn[];
    readonly rows: readonly HabitRow[];
};

export const habitsView = (
    habits: Habits,
    today: Day,
    weekdayOf: (day: Day) => string,
): HabitsView => {
    const days = daysUpTo(today, WINDOW_DAYS);

    return {
        columns: days.map(day => ({
            day,
            weekday: weekdayOf(day),
            date: String(Number(day.slice(8))),
            today: day === today,
        })),
        rows: habits.items.map(({ id, name, done }) => ({
            id,
            name,
            cells: days.map(day => done.includes(day)),
            streak: streakOf(done, today),
        })),
    };
};
