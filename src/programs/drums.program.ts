import { declarations } from '../declarations.ts';
import { merge, of } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, mergeMap, shareReplay } from 'rxjs/operators';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';
import {
    drumsCommandOf,
    drumsMenu,
    drumsMenuCommandOf,
    drumsSections,
} from '../components/drums/drums-controls.ts';

export const drumsProgram = {
    ...declarations.drums,
    size: { width: 560, height: 400 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const [{ HksDrums }, { HksProperties }, { HksMenu }] = await Promise.all([
            import('../components/drums/drums.component.ts'),
            import('../shared/ui/properties.component.ts'),
            import('../shared/ui/menu.component.ts'),
        ]);
        const drums = new HksDrums();
        const properties = new HksProperties();
        properties.slot = 'controls';
        drums.append(properties);
        const menu = new HksMenu();

        return {
            element: drums,
            actions: menu,
            run$: ({ kit$, playhead$, listening$ }) =>
                merge(
                    drums
                        .connect$(
                            kit$.pipe(
                                map(({ drums: pattern }) => pattern),
                                distinctUntilChanged(),
                                shareReplay({ bufferSize: 1, refCount: true }),
                            ),
                            playhead$,
                            listening$,
                        )
                        .pipe(ignoreElements()),
                    properties
                        .connect$(
                            kit$.pipe(
                                map(({ drums: pattern }) => pattern),
                                distinctUntilChanged(),
                                map(drumsSections),
                            ),
                        )
                        .pipe(ignoreElements()),
                    menu.connect$(of(drumsMenu), 'pattern actions').pipe(ignoreElements()),
                    merge(
                        properties.changes$.pipe(mergeMap(drumsCommandOf)),
                        menu.picks$.pipe(mergeMap(drumsMenuCommandOf)),
                    ).pipe(map((command): AppInput => ({ kind: 'drums', command }))),
                    drums.changes$.pipe(
                        map((event): AppInput =>
                            event.kind === 'listen'
                                ? { kind: 'listen' }
                                : { kind: 'drums', command: event.command },
                        ),
                    ),
                ),
        };
    },
} satisfies Program;
