import { ignoreElements, map } from 'rxjs/operators';
import { HksProgressBar } from '../components/progress-bar/progress-bar.component.ts';
import { barView } from '../components/progress-bar/progress-bar.ts';
import { sourceInput } from '../inputs.ts';
import type { Program } from '../program.ts';

export const progressProgram = {
    id: 'progress',
    inputs: { source: sourceInput },
    title: 'progress',
    category: 'plan',
    icon: 'M3.5 9 H20.5 V15 H3.5 Z M3.5 12 H13',
    size: { width: 300, height: 130 },
    minimum: { width: 180, height: 110 },
    launch: () => {
        const bar = new HksProgressBar();

        return {
            element: bar,
            run$: ({ reading$ }) =>
                bar.connect$(reading$.pipe(map(barView))).pipe(ignoreElements()),
        };
    },
} satisfies Program;
