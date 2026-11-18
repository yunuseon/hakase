import { declarations } from '../declarations.ts';
import { ignoreElements, map } from 'rxjs/operators';
import { barView } from '../components/progress-bar/progress-bar.ts';
import type { Program } from '../program.ts';

export const progressProgram = {
    ...declarations.progress,
    size: { width: 300, height: 130 },
    minimum: { width: 180, height: 110 },
    launch: async () => {
        const { HksProgressBar } =
            await import('../components/progress-bar/progress-bar.component.ts');
        const bar = new HksProgressBar();

        return {
            element: bar,
            run$: ({ reading$ }) =>
                bar.connect$(reading$.pipe(map(barView))).pipe(ignoreElements()),
        };
    },
} satisfies Program;
