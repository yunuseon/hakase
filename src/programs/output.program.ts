import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    exhaustMap,
    ignoreElements,
    map,
    mergeMap,
    share,
    shareReplay,
    startWith,
    takeUntil,
    withLatestFrom,
} from 'rxjs/operators';
import { HksImageView } from '../components/image-view/image-view.component.ts';
import type { Shown } from '../components/image-view/image-view.ts';
import { exportPixels, frameCount, withExportChange } from '../components/sketch/animation.ts';
import { statusOf } from '../components/sketch/export/export.ts';
import {
    HksExportPanel,
    type ExportStatus,
    type SavedFile,
} from '../components/sketch/export/export-panel.component.ts';
import { imageExport$, imageStill$ } from '../engine/export.ts';
import { momentOf$, viewRatio$ } from '../engine/moment.ts';
import { view$, type View } from '../engine/view.ts';
import { imageInput, playbackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';
import { asOutput } from '../settings.ts';

export const shownOf =
    (empty: string) =>
    (view: View): Shown =>
        view.kind === 'frame'
            ? view
            : { kind: 'message', text: view.kind === 'empty' ? empty : view.message };

export const outputProgram = {
    id: 'output',
    inputs: { playback: playbackInput, in: imageInput('in') },
    title: 'output',
    category: 'make',
    icon: 'M3 5h18v12H3zM8 21h8M12 17v4',
    size: { width: 480, height: 520 },
    minimum: { width: 240, height: 340 },
    launch: () => {
        const view = new HksImageView();
        const exporter = new HksExportPanel();
        exporter.slot = 'controls';
        view.append(exporter);

        return {
            element: view,
            run$: ({ followedImage$, clock$, zoom$, duration$, playhead$ }, self) => {
                const settings$ = self.settings$.pipe(map(asOutput), distinctUntilChanged());
                const exportSettings$ = settings$.pipe(
                    map(settings => settings.export),
                    distinctUntilChanged(),
                );
                const image$ = followedImage$('in').pipe(
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const frames$ = combineLatest([duration$, exportSettings$]).pipe(
                    map(([seconds, { fps }]) => frameCount(seconds, fps)),
                    distinctUntilChanged(),
                );
                const request$ = combineLatest([
                    image$,
                    duration$,
                    view.sizes$,
                    exportSettings$,
                ]).pipe(
                    map(([image, seconds, size, settings]) => ({ image, seconds, size, settings })),
                );

                const exported$ = merge(
                    exporter.starts$.pipe(
                        withLatestFrom(request$),
                        exhaustMap(([, request]) =>
                            imageExport$(request).pipe(takeUntil(exporter.cancels$)),
                        ),
                    ),
                    exporter.stills$.pipe(
                        withLatestFrom(request$, playhead$),
                        exhaustMap(([, request, t]) => imageStill$(request, t)),
                    ),
                ).pipe(share());

                const status$ = merge(
                    exported$.pipe(map(statusOf)),
                    exporter.cancels$.pipe(map((): ExportStatus => ({ kind: 'idle' }))),
                ).pipe(startWith({ kind: 'idle' as const }));

                const files$: Observable<SavedFile> = exported$.pipe(
                    mergeMap(event =>
                        event.kind === 'file'
                            ? of({ blob: event.blob, name: `hakase-output.${event.extension}` })
                            : EMPTY,
                    ),
                );

                const summary$ = combineLatest([view.sizes$, exportSettings$, frames$]).pipe(
                    map(([size, settings, frames]) => {
                        const { width, height } = exportPixels(size, settings.size);

                        return `${width} × ${height} · ${frames} frames`;
                    }),
                );

                return merge(
                    view
                        .connect$(
                            view$(image$, momentOf$(clock$, view.sizes$, viewRatio$(zoom$))).pipe(
                                map(
                                    shownOf(
                                        'Nothing plugged in. In state mode, wire a sketch into in.',
                                    ),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    exporter
                        .connect$(exportSettings$, summary$, status$, files$)
                        .pipe(ignoreElements()),
                    exporter.changes$.pipe(
                        withLatestFrom(settings$),
                        map(([change, settings]): AppInput => ({
                            kind: 'settings',
                            settings: {
                                ...settings,
                                export: withExportChange(settings.export, change),
                            },
                        })),
                    ),
                );
            },
        };
    },
} satisfies Program;
