import { animationFrames, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    map,
    mergeMap,
    share,
    switchMap,
    takeUntil,
    takeWhile,
    withLatestFrom,
} from 'rxjs/operators';
import { steppedSection } from '../commands.ts';
import { viewport$ } from '../lib/rx.ts';
import type { AppSignal } from '../protocol.ts';
import { centredOn, fitted, flight, IDENTITY } from '../shared/camera.ts';
import { boxOf, type WorkspaceAction } from '../workspace.ts';
import type { Chrome } from './chrome.graph.ts';
import type { Intents } from './intents.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Selection } from './selection.graph.ts';
import { blueprintIn } from '../starters.ts';
import { footprintAt } from '../placing.ts';
import type { Rect } from '../shared/camera.ts';

type Jump =
    | { readonly kind: 'section' | 'window'; readonly id: string }
    | { readonly kind: 'area'; readonly rect: Rect };

type Reads = Pick<Chrome, 'canvas' | 'navigator'> &
    Pick<Intents, 'picked$' | 'zoomSteps$'> &
    Pick<Projections, 'workspace$' | 'blueprints$'> &
    Pick<Selection, 'placing$'> & { readonly inputs$: Observable<AppSignal> };

export const navigationOf = ({
    canvas,
    navigator,
    picked$,
    zoomSteps$,
    workspace$,
    blueprints$,
    placing$,
    inputs$,
}: Reads) => {
    const interrupted$ = merge(canvas.gestures$, zoomSteps$);

    const located$ = inputs$.pipe(
        mergeMap(({ input }) => (input.kind === 'locate' ? of(input.id) : EMPTY)),
        share(),
    );

    const placed$ = placing$.pipe(
        mergeMap(placing => (placing.mode === 'dropped' ? [placing] : [])),
        withLatestFrom(blueprints$, workspace$),
        mergeMap(([{ blueprint, at }, blueprints, { camera }]): Jump[] => {
            const chosen =
                typeof blueprint === 'string' ? blueprintIn(blueprints, blueprint) : blueprint;

            return chosen === undefined
                ? []
                : [{ kind: 'area', rect: footprintAt(chosen.size, at, camera) }];
        }),
    );

    const jumps$: Observable<Jump> = merge(
        located$.pipe(map((id): Jump => ({ kind: 'window', id }))),
        placed$,
        merge(
            navigator.jumps$,
            picked$.pipe(mergeMap(picked => (picked.kind === 'section' ? of(picked.id) : EMPTY))),
            merge(
                canvas.steps$,
                picked$.pipe(
                    mergeMap(picked => (picked.kind === 'step' ? of(picked.direction) : EMPTY)),
                ),
            ).pipe(
                withLatestFrom(workspace$, viewport$),
                mergeMap(([direction, { sections: all, camera }, viewport]) => {
                    const id = steppedSection(all, camera, viewport, direction);

                    return id === null ? EMPTY : of(id);
                }),
            ),
        ).pipe(map((id): Jump => ({ kind: 'section', id }))),
    );

    const flights$: Observable<WorkspaceAction> = jumps$.pipe(
        withLatestFrom(workspace$, viewport$),
        mergeMap(([jump, { sections: all, processes, camera }, viewport]) => {
            const section =
                jump.kind === 'section'
                    ? all.find(candidate => candidate.id === jump.id)
                    : undefined;
            const process =
                jump.kind === 'window'
                    ? processes.find(candidate => candidate.id === jump.id)
                    : undefined;
            // At 100% unless it would not fit: where the view stood says nothing about how to read it.
            const target =
                jump.kind === 'area'
                    ? centredOn(IDENTITY, jump.rect, viewport)
                    : section !== undefined
                      ? fitted(section.rects, viewport)
                      : process !== undefined
                        ? centredOn(IDENTITY, boxOf(process), viewport)
                        : null;

            return target === null ? EMPTY : of(flight(camera, target, viewport));
        }),
        switchMap(path =>
            animationFrames().pipe(
                map(({ elapsed }) => Math.min(elapsed / path.duration, 1)),
                takeWhile(t => t < 1, true),
                map(t => path.at(t * t * (3 - 2 * t))),
                takeUntil(interrupted$),
            ),
        ),
        map((camera): WorkspaceAction => ({ kind: 'set-camera', camera })),
    );

    return { located$, flights$ };
};

export type Navigation = ReturnType<typeof navigationOf>;
