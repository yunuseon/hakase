import { animationFrameScheduler, combineLatest, EMPTY, from, type Observable } from 'rxjs';
import { auditTime, concatMap, map, switchMap } from 'rxjs/operators';
import { supersampleFor, type StripLayout } from '../components/sketch/animation.ts';
import { centre } from '../components/sketch/params.ts';
import type { Filmstrip } from '../components/sketch/strip/thumbnails.ts';
import type { Image } from '../image.ts';
import { cook, drawn } from './engine.ts';
import { engine$ } from './view.ts';

export const imageThumbnails$ = (
    image$: Observable<Image>,
    seconds$: Observable<number>,
    ratio$: Observable<number>,
    layout$: Observable<StripLayout>,
): Observable<Filmstrip> =>
    engine$.pipe(
        switchMap(engine =>
            engine instanceof Error
                ? EMPTY
                : combineLatest([image$, seconds$, ratio$, layout$]).pipe(
                      auditTime(0, animationFrameScheduler),
                      concatMap(([image, seconds, ratio, { geometry, range }]) => {
                          const count = range.last - range.first + 1;

                          if (image.kind === 'none' || count <= 0) {
                              return EMPTY;
                          }

                          const dimensions: unknown = engine.gl.getParameter(
                              engine.gl.MAX_VIEWPORT_DIMS,
                          );
                          const limit =
                              dimensions instanceof Int32Array ? (dimensions[0] ?? 4096) : 4096;
                          const supersample = supersampleFor(
                              {
                                  width: count * geometry.tileWidth * ratio,
                                  height: geometry.tileHeight * ratio,
                              },
                              limit,
                          );
                          const slot = {
                              width: Math.max(
                                  1,
                                  Math.round(geometry.tileWidth * ratio * supersample),
                              ),
                              height: Math.max(
                                  1,
                                  Math.round(geometry.tileHeight * ratio * supersample),
                              ),
                          };
                          const now = performance.now();

                          Array.from({ length: count }, (_, at) => range.first + at).forEach(
                              (index, at) => {
                                  const t =
                                      Math.min(index * geometry.perTile, geometry.frames - 1) /
                                      geometry.frames;
                                  const texture = cook(
                                      engine,
                                      image,
                                      {
                                          t,
                                          seconds,
                                          ...slot,
                                          pointer: centre,
                                          pass: 0,
                                          scale: null,
                                      },
                                      now,
                                  );
                                  drawn(engine, texture, slot.width, slot.height, at * slot.width);
                              },
                          );

                          return from(
                              createImageBitmap(
                                  engine.canvas,
                                  0,
                                  engine.canvas.height - slot.height,
                                  slot.width * count,
                                  slot.height,
                                  {
                                      resizeWidth: Math.round(count * geometry.tileWidth * ratio),
                                      resizeHeight: Math.round(geometry.tileHeight * ratio),
                                      resizeQuality: 'high',
                                  },
                              ),
                          ).pipe(
                              map((bitmap): Filmstrip => ({
                                  bitmap,
                                  left: range.first * geometry.tileWidth,
                                  width: count * geometry.tileWidth,
                                  height: geometry.tileHeight,
                              })),
                          );
                      }),
                  ),
        ),
    );
