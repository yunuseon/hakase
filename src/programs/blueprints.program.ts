import { declarations } from '../declarations.ts';
import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import type { BlueprintCard } from '../components/blueprints/blueprints.ts';
import type { Blueprint } from '../blueprints.ts';
import { STARTERS } from '../starters.ts';
import type { AppInput, Program } from '../program.ts';

const cardOf = ({ id, name, size, windows }: Blueprint, summary: string | null): BlueprintCard => ({
    id,
    name,
    size,
    summary,
    windows: windows.map(({ frame }) => ({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
    })),
});

export const blueprintsProgram = {
    ...declarations.blueprints,
    size: { width: 360, height: 420 },
    minimum: { width: 260, height: 220 },
    launch: async () => {
        const { HksBlueprints } = await import('../components/blueprints/blueprints.component.ts');
        const blueprints = new HksBlueprints();

        return {
            element: blueprints,
            run$: ({ blueprints$ }) =>
                merge(
                    blueprints
                        .connect$(
                            blueprints$.pipe(
                                map(({ items }) => [
                                    ...STARTERS.map(starter => cardOf(starter, starter.summary)),
                                    ...items.map(blueprint => cardOf(blueprint, null)),
                                ]),
                            ),
                        )
                        .pipe(ignoreElements()),
                    blueprints.changes$.pipe(
                        map((event): AppInput =>
                            event.kind === 'place'
                                ? { kind: 'place-blueprint', id: event.id }
                                : { kind: 'blueprint', command: event },
                        ),
                    ),
                ),
        };
    },
} satisfies Program;
