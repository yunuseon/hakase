import { combineLatest, merge } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    shareReplay,
    withLatestFrom,
} from 'rxjs/operators';
import type { PaintView } from '../components/paint/paint.ts';
import { playbackInput } from '../inputs.ts';
import { paintInputsOf, workingFrame } from '../painting.ts';
import type { Program } from '../program.ts';
import { asPaint } from '../settings.ts';
import { frameAt } from '../shared/picture.ts';

export const paintProgram = {
    id: 'paint',
    inputs: { playback: playbackInput },
    title: 'paint',
    category: 'make',
    icon: 'M5 19 C5 15 8 14 10 14 L18 6 L20 8 L12 16 C12 18 10 20 5 19 Z',
    size: { width: 460, height: 580 },
    minimum: { width: 320, height: 420 },
    launch: async () => {
        const { HksPaint } = await import('../components/paint/paint.component.ts');
        const paint = new HksPaint();

        return {
            element: paint,
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
                    paint.changes$.pipe(
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
