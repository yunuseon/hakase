import type { Program } from '../program.ts';
import { defer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export const storybookProgram = {
    id: 'storybook',
    title: 'storybook',
    category: 'system',
    inputs: {},
    icon: 'M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15',
    size: { width: 920, height: 640 },
    minimum: { width: 280, height: 400 },
    launch: async () => {
        const { HksStorybook } = await import('../components/storybook/storybook.component.ts');
        const book = new HksStorybook();
        return {
            element: book,
            run$: state =>
                defer(() => import('../storybook/connect.ts')).pipe(
                    switchMap(({ connectBook$ }) => connectBook$(book, state)),
                ),
        };
    },
} satisfies Program;
