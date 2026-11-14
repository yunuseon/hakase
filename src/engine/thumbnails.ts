import { animationFrameScheduler, combineLatest, EMPTY, from, merge, type Observable } from 'rxjs';
import { auditTime, concatMap, debounceTime, filter, map, share, switchMap } from 'rxjs/operators';
import { fitted, supersampleFor, type StripLayout } from '../components/sketch/animation.ts';
import { evolves } from '../components/sketch/gl/sketch-program.ts';
import { centre } from '../components/sketch/params.ts';
import type { Filmstrip } from '../components/sketch/strip/filmstrip.ts';
import type { Size } from '../components/window/frame.ts';
import { stagesOf, stillOf, type Image } from '../image.ts';
import { backdropOf, cook, filmed, filmFor, framedIn } from './engine.ts';
import { engine$ } from './view.ts';

const SETTLE_MS = 250;

const replays = (image: Image): boolean =>
    stagesOf(image).some(stage => stage.kind === 'points' && evolves(stage.source));

export type Framing = { readonly frame: Size | null; readonly shape: Size };

type Scene = {
    readonly image: Image;
    readonly framing: Framing;
    readonly seconds: number;
    readonly ratio: number;
    readonly layout: StripLayout;
};

export const filmstrip$ = (
    image$: Observable<Image>,
    framing$: Observable<Framing>,
    seconds$: Observable<number>,
    ratio$: Observable<number>,
    layout$: Observable<StripLayout>,
): Observable<Filmstrip> =>
    engine$.pipe(
        switchMap(engine => {
            if (engine instanceof Error) {
                return EMPTY;
            }

            const scene$ = combineLatest([image$, framing$, seconds$, ratio$, layout$]).pipe(
                map(([image, framing, seconds, ratio, layout]): Scene => ({
                    image: stillOf(image),
                    framing,
                    seconds,
                    ratio,
                    layout,
                })),
                share(),
            );

            return merge(
                scene$.pipe(
                    filter(({ image }) => !replays(image)),
                    auditTime(0, animationFrameScheduler),
                ),
                // A replay to the last tile can take a third of a second, so an evolving picture waits for things to settle.
                scene$.pipe(
                    filter(({ image }) => replays(image)),
                    debounceTime(SETTLE_MS),
                ),
            ).pipe(
                concatMap(({ image, framing, seconds, ratio, layout: { geometry, range } }) => {
                    const { frame, shape } = framing;
                    const count = range.last - range.first + 1;

                    if (image.kind === 'none' || count <= 0) {
                        return EMPTY;
                    }

                    const dimensions: unknown = engine.gl.getParameter(engine.gl.MAX_VIEWPORT_DIMS);
                    const limit = dimensions instanceof Int32Array ? (dimensions[0] ?? 4096) : 4096;
                    const supersample = supersampleFor(
                        {
                            width: count * geometry.tileWidth * ratio,
                            height: geometry.tileHeight * ratio,
                        },
                        limit,
                    );
                    const tile = {
                        width: Math.max(1, Math.round(geometry.tileWidth * ratio)),
                        height: Math.max(1, Math.round(geometry.tileHeight * ratio)),
                    };
                    const slot = {
                        width: tile.width * supersample,
                        height: tile.height * supersample,
                    };
                    const box = fitted(slot, shape);
                    const dotScale =
                        frame === null ? 1 : box.width / Math.max(frame.width, 1) / ratio;
                    const backdrop = backdropOf(image);
                    const now = performance.now();

                    const film = filmFor(engine, slot.width * count, slot.height, now);

                    // Left to right, so one replay from the start passes every tile's moment in turn.
                    Array.from({ length: count }, (_, at) => range.first + at).forEach(
                        (index, at) => {
                            const t =
                                Math.min(index * geometry.perTile, geometry.frames - 1) /
                                geometry.frames;
                            const picture = cook(
                                engine,
                                image,
                                {
                                    t,
                                    seconds,
                                    width: Math.max(1, box.width),
                                    height: Math.max(1, box.height),
                                    pointer: centre,
                                    pass: 0,
                                    frame,
                                    dotScale,
                                    lane: 'strip',
                                },
                                now,
                            );
                            framedIn(
                                engine,
                                film,
                                picture,
                                { x: at * slot.width, ...slot },
                                backdrop,
                            );
                        },
                    );

                    return from(
                        filmed(engine, film, tile.width * count, tile.height, supersample),
                    ).pipe(
                        map((bitmap): Filmstrip => ({
                            bitmap,
                            left: range.first * geometry.tileWidth,
                            width: count * geometry.tileWidth,
                            height: geometry.tileHeight,
                        })),
                    );
                }),
            );
        }),
    );
