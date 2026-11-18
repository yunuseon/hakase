import { declarations } from '../declarations.ts';
import type { Program } from '../program.ts';
import { defer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export const storybookProgram = {
    ...declarations.storybook,
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
