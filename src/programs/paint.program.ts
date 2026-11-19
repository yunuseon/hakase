import { declarations } from '../declarations.ts';
import { combineLatest, merge, of } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    shareReplay,
    withLatestFrom,
} from 'rxjs/operators';
import type { PaintView } from '../model/paint.ts';
import { paintEventOf, paintMenu } from '../components/paint/paint-menu.ts';
import { paintEventOfChange, paintSections } from '../components/paint/paint-controls.ts';
import { paintInputsOf, workingFrame } from '../painting.ts';
import type { Program } from '../program.ts';
import { asPaint } from '../settings.ts';
import { frameAt } from '../shared/picture.ts';

export const paintProgram = {
    ...declarations.paint,
    size: { width: 460, height: 580 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const [{ HksPaint }, { HksMenu }, { HksProperties }] = await Promise.all([
            import('../components/paint/paint.component.ts'),
            import('../shared/ui/menu.component.ts'),
            import('../shared/ui/properties.component.ts'),
        ]);
        const paint = new HksPaint();
        const menu = new HksMenu();
        const properties = new HksProperties();
        paint.append(properties);

        return {
            element: paint,
            actions: menu,
            run$: ({ picture$, playhead$ }, self) => {
                const settings$ = self.settings$.pipe(
                    map(asPaint),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const view$ = combineLatest([picture$, settings$]).pipe(
                    map(([picture, settings]): PaintView => ({
                        picture,
                        tool: settings.tool,
                        size: settings.size,
                        hardness: settings.hardness,
                        flow: settings.flow,
                        symmetry: settings.symmetry,
                        frame: workingFrame(settings, picture),
                        onion: settings.onion,
                    })),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const playing$ = combineLatest([picture$, playhead$]).pipe(
                    map(([picture, t]) => Math.floor(frameAt(picture, t))),
                );

                return merge(
                    paint.connect$(view$, playing$).pipe(ignoreElements()),
                    menu.connect$(of(paintMenu), 'frame actions').pipe(ignoreElements()),
                    properties.connect$(view$.pipe(map(paintSections))).pipe(ignoreElements()),
                    merge(
                        paint.changes$,
                        menu.picks$.pipe(mergeMap(paintEventOf)),
                        properties.changes$.pipe(mergeMap(paintEventOfChange)),
                    ).pipe(
                        withLatestFrom(settings$, picture$),
                        mergeMap(([event, settings, picture]) =>
                            paintInputsOf(event, settings, picture),
                        ),
                    ),
                );
            },
        };
    },
} satisfies Program;
