import { combineLatest, merge } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { variables } from '../appearance.ts';
import { HksCanvas } from '../components/canvas/canvas.component.ts';
import { HksNavigator } from '../components/navigator/navigator.component.ts';
import { minimapOf } from '../components/navigator/navigator.ts';
import { HksPalette } from '../components/palette/palette.component.ts';
import { HksPlacement } from '../components/placement/placement.component.ts';
import { HksSeams } from '../components/seams/seams.component.ts';
import { HksSectionDrawing } from '../components/section-drawing/section-drawing.component.ts';
import { HksSections } from '../components/sections/sections.component.ts';
import type { SectionView } from '../components/sections/sections.ts';
import { HksSelection } from '../components/selection/selection.component.ts';
import { HksStateWiring } from '../components/state-wiring/state-wiring.component.ts';
import { HksToolbar } from '../components/toolbar/toolbar.component.ts';
import { commandsOf } from '../commands.ts';
import { viewport$ } from '../lib/rx.ts';
import { ghostOf } from '../placing.ts';
import { categoriesOf } from '../program-categories.ts';
import { programList } from '../programs.ts';
import { selectionView } from '../selection.ts';
import { zoomLabel } from '../shared/camera.ts';
import { blueprintIn } from '../starters.ts';
import { boxOf, seamsOf } from '../workspace.ts';
import type { Intents } from './intents.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Selection } from './selection.graph.ts';
import type { StateMode } from './state-mode.graph.ts';

export const mountChrome = () => {
    const canvas = new HksCanvas();
    document.body.append(canvas);

    const toolbar = new HksToolbar().categories(categoriesOf(programList));
    toolbar.slot = 'launcher';

    const navigator = new HksNavigator();
    navigator.slot = 'chrome';
    navigator.append(toolbar);
    canvas.append(navigator);

    const seams = new HksSeams();
    canvas.append(seams);
    const wiring = new HksStateWiring();
    canvas.append(wiring);

    const sections = new HksSections();
    canvas.append(sections);

    const palette = new HksPalette();
    palette.slot = 'chrome';
    canvas.append(palette);

    const selection = new HksSelection();
    selection.slot = 'chrome';
    canvas.append(selection);

    const sectionDrawing = new HksSectionDrawing();
    sectionDrawing.slot = 'chrome';
    canvas.append(sectionDrawing);

    const placement = new HksPlacement();
    placement.slot = 'chrome';
    canvas.append(placement);

    return {
        canvas,
        toolbar,
        navigator,
        seams,
        wiring,
        sections,
        palette,
        selection,
        sectionDrawing,
        placement,
    };
};

export type Chrome = ReturnType<typeof mountChrome>;

type Shown = Chrome &
    Pick<Intents, 'paletteOpen$' | 'drawing$'> &
    Pick<
        Projections,
        'workspace$' | 'camera$' | 'ids$' | 'blueprints$' | 'history$' | 'look$' | 'appearance$'
    > &
    Pick<Selection, 'selectedIds$' | 'clipboard$' | 'placing$'> &
    Pick<StateMode, 'mode$' | 'wiringView$'>;

export const connectChrome$ = ({
    canvas,
    toolbar,
    navigator,
    seams,
    wiring,
    sections,
    palette,
    selection,
    sectionDrawing,
    placement,
    paletteOpen$,
    drawing$,
    workspace$,
    camera$,
    ids$,
    blueprints$,
    history$,
    look$,
    appearance$,
    selectedIds$,
    clipboard$,
    placing$,
    mode$,
    wiringView$,
}: Shown) =>
    merge(
        canvas.connect$(
            camera$,
            look$.pipe(
                switchMap(appearance$),
                map(({ value }) => variables(value)),
            ),
            mode$.pipe(map(mode => mode.active)),
        ),
        toolbar.connect$(),
        sectionDrawing.connect$(drawing$),
        selection.connect$(
            combineLatest([selectedIds$, ids$, clipboard$]).pipe(
                map(([selected, live, copied]) => selectionView(live, selected, copied !== null)),
            ),
        ),
        seams.connect$(workspace$.pipe(map(seamsOf))),
        wiring.connect$(wiringView$),
        placement.connect$(
            combineLatest([placing$, camera$, blueprints$]).pipe(
                map(([placing, camera, blueprints]) => {
                    const blueprint =
                        placing.mode === 'placing'
                            ? typeof placing.blueprint === 'string'
                                ? blueprintIn(blueprints, placing.blueprint)
                                : placing.blueprint
                            : undefined;

                    return placing.mode !== 'placing' || blueprint === undefined
                        ? null
                        : ghostOf(blueprint, placing.at, camera);
                }),
            ),
        ),
        palette.connect$(
            workspace$.pipe(map(workspace => commandsOf(programList, workspace))),
            paletteOpen$,
        ),
        sections.connect$(
            workspace$.pipe(
                map(({ sections: all }) =>
                    all.map(({ id, name, rects }): SectionView => ({ id, name, rects })),
                ),
            ),
        ),
        navigator.connect$(
            combineLatest([workspace$, viewport$]).pipe(
                map(([{ processes, sections: all, camera }, viewport]) =>
                    minimapOf(processes.map(boxOf), all, camera, viewport),
                ),
            ),
            camera$.pipe(map(zoomLabel)),
            workspace$.pipe(map(({ minimap }) => minimap)),
            history$.pipe(
                map(({ cursor, steps }) => ({ undo: cursor > 0, redo: cursor < steps.length })),
            ),
            mode$.pipe(map(mode => mode.active)),
        ),
    );
