import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksTaskManager } from '../components/task-manager/task-manager.component.ts';
import type { TaskRow } from '../components/task-manager/task-manager.ts';
import type { AppInput, Program } from '../program.ts';

export const tasksProgram: Program = {
    id: 'tasks',
    title: 'tasks',
    category: 'system',
    icon: 'M4 6 H4.01 M8 6 H20 M4 12 H4.01 M8 12 H20 M4 18 H4.01 M8 18 H20',
    size: { width: 260, height: 300 },
    minimum: { width: 200, height: 160 },
    launch: () => {
        const manager = new HksTaskManager();

        return {
            element: manager,
            run$: ({ tasks$ }, self) =>
                merge(
                    manager
                        .connect$(
                            tasks$.pipe(
                                map(tasks =>
                                    tasks.map(({ id, title, icon, ordinal, focused }): TaskRow => ({
                                        id,
                                        label: `${title} ${ordinal}`,
                                        icon,
                                        focused,
                                    })),
                                ),
                            ),
                            tasks$.pipe(
                                map(tasks => tasks.filter(({ id }) => id !== self.id).length),
                            ),
                        )
                        .pipe(ignoreElements()),
                    manager.reveals$.pipe(
                        map((id): AppInput => ({ kind: 'task', command: 'reveal', id })),
                    ),
                    manager.closes$.pipe(
                        map((id): AppInput => ({ kind: 'task', command: 'close', id })),
                    ),
                    manager.closeAlls$.pipe(map((): AppInput => ({ kind: 'close-others' }))),
                ),
        };
    },
};
