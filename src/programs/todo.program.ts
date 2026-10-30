import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksTodo } from '../components/todo/todo.component.ts';
import type { AppInput, Program } from '../program.ts';

export const todoProgram: Program = {
    id: 'todo',
    title: 'todo',
    kind: 'floating',
    icon: 'M4 6.5 L5.8 8.3 L8.8 5 M12 7 H20 M4 13.5 L5.8 15.3 L8.8 12 M12 14 H20 M12 20 H20 M5 20 H8',
    size: { width: 280, height: 320 },
    launch: () => {
        const todo = new HksTodo();

        return {
            element: todo,
            run$: ({ todos$ }) =>
                merge(
                    todo.connect$(todos$).pipe(ignoreElements()),
                    todo.commands$.pipe(map((command): AppInput => ({ kind: 'todo', command }))),
                ),
        };
    },
};
