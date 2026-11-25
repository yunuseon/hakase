import { declarations } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    shareReplay,
    startWith,
} from 'rxjs/operators';
import {
    objectSections,
    renderSections,
    sceneCommandOf,
    type SceneTab,
    type SceneView,
} from '../components/scene/scene-sections.ts';
import type { SceneControlsEvent } from '../components/scene/scene.component.ts';
import { chainShowing$, viewRatio$ } from '../engine/moment.ts';
import { sceneChecked$, view$ } from '../engine/view.ts';
import { SCENE_KNOBS } from '../model/scene.ts';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';
import { chainLine } from '../why.ts';
import { shownOf } from './output.program.ts';

export const sceneProgram = {
    ...declarations.scene,
    size: { width: 560, height: 680 },
    minimum: { width: 200, height: 160 },
    launch: async () => {
        const [{ HksImageView }, { HksSceneControls }, { HksProperties }] = await Promise.all([
            import('../components/image-view/image-view.component.ts'),
            import('../components/scene/scene.component.ts'),
            import('../shared/ui/properties.component.ts'),
        ]);
        const view = new HksImageView();
        const controls = new HksSceneControls();
        const objects = new HksProperties();
        const render = new HksProperties();
        controls.slot = 'controls';
        objects.slot = 'objects';
        render.slot = 'render';
        controls.append(objects, render);
        view.append(controls);

        return {
            element: view,
            run$: ({
                scene$,
                image$,
                linkedDriver$,
                chains$,
                clock$,
                zoom$,
                aspect$,
                previewSide$,
            }) => {
                const driven$ = combineLatest(
                    SCENE_KNOBS.map(knob =>
                        linkedDriver$(knob).pipe(
                            map(driver => driver !== null),
                            distinctUntilChanged(),
                        ),
                    ),
                );
                const sceneView$ = combineLatest([scene$, driven$, chains$]).pipe(
                    map(([scene, driven, chains]): SceneView => ({
                        scene,
                        driven: {
                            k1: driven[0] === true ? chainLine('k1', chains) : null,
                            k2: driven[1] === true ? chainLine('k2', chains) : null,
                            k3: driven[2] === true ? chainLine('k3', chains) : null,
                            k4: driven[3] === true ? chainLine('k4', chains) : null,
                        },
                    })),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const code$ = scene$.pipe(
                    map(({ code }) => code),
                    distinctUntilChanged(),
                );
                const tab$ = controls.changes$.pipe(
                    mergeMap((event: SceneControlsEvent) =>
                        event.kind === 'tab' ? [event.tab] : [],
                    ),
                    startWith<SceneTab>('objects'),
                    distinctUntilChanged(),
                );
                const error$ = sceneChecked$(code$).pipe(
                    map(check => (check.ok ? null : check.message)),
                );

                return merge(
                    view
                        .connect$(
                            view$(
                                image$,
                                chainShowing$(
                                    clock$,
                                    aspect$,
                                    previewSide$,
                                    view.sizes$,
                                    viewRatio$(zoom$),
                                ),
                            ).pipe(map(shownOf('Nothing to trace.'))),
                        )
                        .pipe(ignoreElements()),
                    controls
                        .connect$(
                            combineLatest([tab$, code$, error$]).pipe(
                                map(([tab, code, error]) => ({ tab, code, error })),
                            ),
                        )
                        .pipe(ignoreElements()),
                    objects.connect$(sceneView$.pipe(map(objectSections))).pipe(ignoreElements()),
                    render.connect$(sceneView$.pipe(map(renderSections))).pipe(ignoreElements()),
                    merge(objects.changes$, render.changes$).pipe(
                        mergeMap(sceneCommandOf),
                        map((command): AppInput => ({ kind: 'scene', command })),
                    ),
                    controls.changes$.pipe(
                        mergeMap((event: SceneControlsEvent): AppInput[] =>
                            event.kind === 'code'
                                ? [{ kind: 'scene', command: { kind: 'code', code: event.code } }]
                                : [],
                        ),
                    ),
                    view.orbits$.pipe(
                        map((action): AppInput => ({
                            kind: 'scene',
                            command: { kind: 'orbit', action },
                        })),
                    ),
                    controls.whys$.pipe(map((input): AppInput => ({ kind: 'why', input }))),
                );
            },
        };
    },
} satisfies Program<'scene'>;
