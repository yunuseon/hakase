import {
    animationFrameScheduler,
    combineLatest,
    EMPTY,
    from,
    merge,
    type Observable,
    of,
} from 'rxjs';
import {
    auditTime,
    concatMap,
    debounceTime,
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    share,
    switchMap,
    tap,
} from 'rxjs/operators';
import { fitted, supersampleFor, type StripLayout, type TileRange } from '../animation.ts';
import { centre, type SketchParams } from '../params.ts';
import type { Orbit } from '../space.ts';
import { createSketch, drawFrame, prepare } from '../gl/sketch-program.ts';
import { offscreen$ } from '../gl/still.ts';
import { bindState, evolve, simulated$ } from '../gl/simulation.ts';
import { evolutionTo, stepAt, type Evolved } from '../evolution.ts';
import { growSurface } from '../gl/surface.ts';
import { buildRamp } from '../theme.ts';

export type ThumbnailScene = {
    readonly params: SketchParams;
    readonly orbit: Orbit;
    readonly ratio: number;
    readonly seconds: number;
};

export type Filmstrip = {
    readonly bitmap: ImageBitmap;
    // Where it goes in the track, in track pixels.
    readonly left: number;
    readonly width: number;
    readonly height: number;
};

const SETTLE_MS = 250;

const tilesOf = ({ first, last }: TileRange): readonly number[] =>
    last < first ? [] : Array.from({ length: last - first + 1 }, (_, index) => first + index);

export const thumbnails$ = (
    source$: Observable<string>,
    scene$: Observable<ThumbnailScene>,
    layout$: Observable<StripLayout>,
): Observable<Filmstrip> =>
    offscreen$({ width: 1, height: 1 }).pipe(
        switchMap(surface => {
            const dimensions: unknown = surface.gl.getParameter(surface.gl.MAX_VIEWPORT_DIMS);
            const limit = dimensions instanceof Int32Array ? (dimensions[0] ?? 4096) : 4096;
            const sketch$ = source$.pipe(
                distinctUntilChanged(),
                map(source => createSketch(surface.gl, source)),
                mergeMap(result => (result.ok ? of(result.sketch) : EMPTY)),
                share(),
            );

            const retired$ = sketch$.pipe(
                pairwise(),
                tap(([replaced]) => {
                    surface.gl.deleteProgram(replaced.program);
                }),
                mergeMap(() => EMPTY),
            );

            const staged$ = simulated$(
                surface.gl,
                combineLatest([sketch$, scene$, layout$]).pipe(
                    map(([sketch, scene, layout]) => ({
                        sketch,
                        params: scene.params,
                        scene,
                        layout,
                    })),
                ),
            );

            const shared$ = staged$.pipe(share());
            const rendered$ = merge(
                // At most once per frame, in step with the canvas: a pointer moves several times a frame.
                shared$.pipe(
                    filter(({ simulation }) => simulation === null),
                    auditTime(0, animationFrameScheduler),
                ),
                // An evolving formula replays the loop to the last tile, up to a third of a second: so once things settle.
                shared$.pipe(
                    filter(({ simulation }) => simulation !== null),
                    debounceTime(SETTLE_MS),
                ),
            ).pipe(
                concatMap(
                    ({
                        sketch,
                        simulation,
                        scene: { params, orbit, ratio, seconds },
                        layout: { geometry, range },
                    }) => {
                        const tiles = tilesOf(range);

                        if (tiles.length === 0) {
                            return EMPTY;
                        }

                        // Supersampled, then averaged down: at tile size, dots under a couple of pixels lose coverage and read pale.
                        const supersample = supersampleFor(
                            {
                                width: tiles.length * geometry.tileWidth * ratio,
                                height: geometry.tileHeight * ratio,
                            },
                            limit,
                        );
                        const slot = {
                            width: Math.round(geometry.tileWidth * ratio * supersample),
                            height: Math.round(geometry.tileHeight * ratio * supersample),
                        };
                        const box = fitted(slot, params);
                        // The sketch's own parameters, size included: a thumbnail is the frame scaled down, not reframed.
                        const still = { ...params, trails: 0 };
                        const { gl } = surface;

                        growSurface(
                            surface,
                            { width: slot.width * tiles.length, height: slot.height },
                            limit,
                        );
                        prepare(
                            surface,
                            sketch,
                            still,
                            buildRamp(params.theme),
                            box.width / Math.max(params.width, 1),
                            box.width / Math.max(params.width, 1) / ratio,
                        );

                        // The scissor keeps each draw's clear inside its own slot, which leaves the backdrop around the picture.
                        gl.enable(gl.SCISSOR_TEST);
                        // Tiles run left to right, so one replay from the start passes every tile's moment in turn.
                        tiles.reduce<Evolved | null>((done, index, at) => {
                            const t =
                                Math.min(index * geometry.perTile, geometry.frames - 1) /
                                geometry.frames;
                            const evolution =
                                simulation === null
                                    ? null
                                    : evolutionTo(done, stepAt(t, seconds, sketch.steps));

                            if (simulation !== null && evolution !== null) {
                                evolve(gl, sketch, simulation, evolution, {
                                    params: still,
                                    seconds,
                                    pointer: centre,
                                    orbit,
                                });
                                bindState(gl, sketch, simulation, evolution.end.front);
                            }

                            gl.scissor(at * slot.width, 0, slot.width, slot.height);
                            gl.viewport(at * slot.width + box.x, box.y, box.width, box.height);
                            drawFrame(gl, sketch, still, t, centre, orbit);

                            return evolution?.end ?? null;
                        }, null);
                        gl.disable(gl.SCISSOR_TEST);

                        // Bottom rows, where GL draws; and a true area average, not the bilinear CSS scaling that skips pixels.
                        return from(
                            createImageBitmap(
                                surface.canvas,
                                0,
                                surface.canvas.height - slot.height,
                                slot.width * tiles.length,
                                slot.height,
                                {
                                    resizeWidth: Math.round(
                                        tiles.length * geometry.tileWidth * ratio,
                                    ),
                                    resizeHeight: Math.round(geometry.tileHeight * ratio),
                                    resizeQuality: 'high',
                                },
                            ),
                        ).pipe(
                            map(bitmap => ({
                                bitmap,
                                left: range.first * geometry.tileWidth,
                                width: tiles.length * geometry.tileWidth,
                                height: geometry.tileHeight,
                            })),
                        );
                    },
                ),
            );

            return merge(rendered$, retired$);
        }),
    );
