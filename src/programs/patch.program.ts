import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksPatchBay } from '../components/patch-bay/patch-bay.component.ts';
import { layoutOf } from '../components/patch-bay/patch.ts';
import type { AppInput, Program } from '../program.ts';

export const patchProgram = {
    id: 'patch',
    inputs: {},
    title: 'patch bay',
    category: 'system',
    icon: 'M5 6 h3 M5 12 h3 M5 18 h3 M16 6 h3 M16 12 h3 M16 18 h3 M8 6 C 12 6, 12 12, 16 12 M8 18 C 12 18, 12 6, 16 6',
    size: { width: 480, height: 420 },
    minimum: { width: 340, height: 220 },
    launch: () => {
        const bay = new HksPatchBay();

        return {
            element: bay,
            run$: ({ patch$ }) =>
                merge(
                    bay.connect$(patch$.pipe(map(layoutOf))).pipe(ignoreElements()),
                    bay.commands$.pipe(
                        map((command): AppInput =>
                            command.kind === 'locate'
                                ? { kind: 'locate', id: command.window }
                                : { kind: 'patch', command },
                        ),
                    ),
                ),
        };
    },
} satisfies Program;
