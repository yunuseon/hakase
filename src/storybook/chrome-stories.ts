import { merge, of } from 'rxjs';
import { map, scan, share, shareReplay, startWith, tap } from 'rxjs/operators';
import { HksCanvas } from '../components/canvas/canvas.component.ts';
import { HksWindow } from '../components/window/window.component.ts';
import { moved, resized, type Frame } from '../components/window/frame.ts';
import { HksSections } from '../components/sections/sections.component.ts';
import { HksSeams } from '../components/seams/seams.component.ts';
import { HksNavigator } from '../components/navigator/navigator.component.ts';
import { HksToolbar } from '../components/toolbar/toolbar.component.ts';
import { HksPalette } from '../components/palette/palette.component.ts';
import { HksPlacement } from '../components/placement/placement.component.ts';
import { HksStateWiring } from '../components/state-wiring/state-wiring.component.ts';
import { categoriesOf } from '../program-categories.ts';
import { programs } from '../programs.ts';
import { defaults, recorded, type Story } from './story.ts';
import { panned, zoomedAround, IDENTITY } from '../shared/camera.ts';

const normal = [{ id: 'default', title: 'Default' }];
export const chromeStories: readonly Story[] = [
    {
        id: 'navigator',
        title: 'Navigation card',
        group: 'Workspace',
        description:
            'One expanding minimap surface. The compact pill keeps Make, Plan, System, State, a live thumbnail and zoom; expand it for history, section targets and navigation controls.',
        elements: ['hks-navigator', 'hks-toolbar'],
        variants: [
            { id: 'compact', title: 'Compact' },
            { id: 'expanded', title: 'Expanded' },
            { id: 'empty', title: 'Empty canvas' },
        ],
        controls: [],
        defaults,
        height: 360,
        action: null,
        code: "const navigator = new HksNavigator();\nconst launcher = new HksToolbar().categories(categoriesOf(programs));\nlauncher.slot = 'launcher';\nnavigator.append(launcher);\nconst lifetime$ = merge(\n  launcher.connect$(),\n  navigator.connect$(map$, zoom$, open$, history$, mode$),\n);\n// The owner folds launcher.launches$ and navigator requests.",
        create: ({ variant }) => {
            const element = new HksNavigator();
            const launcher = new HksToolbar().categories(categoriesOf(Object.values(programs)));
            launcher.slot = 'launcher';
            element.append(launcher);
            const open$ = element.toggles$.pipe(
                scan(open => !open, variant !== 'compact'),
                startWith(variant !== 'compact'),
            );
            const mode$ = element.modes$.pipe(
                scan(active => !active, false),
                startWith(false),
            );
            const zoom$ = element.zooms$.pipe(
                scan(
                    (zoom, command) =>
                        command === 'in'
                            ? Math.min(500, Math.round(zoom * 1.25))
                            : command === 'out'
                              ? Math.max(10, Math.round(zoom / 1.25))
                              : command === 'fit'
                                ? 75
                                : 100,
                    100,
                ),
                startWith(100),
                map(zoom => `${zoom}%`),
            );
            const overview = {
                windows:
                    variant === 'empty'
                        ? []
                        : [
                              { x: 42, y: 34, width: 72, height: 58 },
                              { x: 135, y: 52, width: 92, height: 80 },
                              { x: 246, y: 98, width: 46, height: 45 },
                          ],
                sections:
                    variant === 'empty'
                        ? []
                        : [
                              {
                                  id: 'make',
                                  name: 'Make',
                                  rect: { x: 26, y: 18, width: 214, height: 128 },
                              },
                              {
                                  id: 'plan',
                                  name: 'Plan',
                                  rect: { x: 242, y: 78, width: 68, height: 82 },
                              },
                          ],
                view: { x: 18, y: 16, width: 170, height: 135 },
            };
            return {
                element,
                run$: merge(
                    launcher.connect$(),
                    element.connect$(
                        of(overview),
                        zoom$,
                        open$,
                        of({ undo: true, redo: false }),
                        mode$,
                    ),
                ),
                events$: merge(
                    launcher.launches$.pipe(map(id => recorded('launch', id))),
                    element.toggles$.pipe(map(() => recorded('toggle', 'navigation'))),
                    element.modes$.pipe(map(() => recorded('mode', 'toggle'))),
                    element.zooms$.pipe(map(value => recorded('zoom', value))),
                    element.edits$.pipe(map(value => recorded('edit', value))),
                    element.jumps$.pipe(map(value => recorded('section', value))),
                    element.adds$.pipe(map(() => recorded('section', 'create'))),
                ),
            };
        },
    },
    {
        id: 'workspace-chrome',
        title: 'Workspace chrome',
        group: 'Workspace',
        description:
            'The real canvas, window frame, section outline, attachment seam, toolbar and navigator. Drag and resize the sample window; all actions stay here.',
        elements: [
            'hks-canvas',
            'hks-window',
            'hks-sections',
            'hks-seams',
            'hks-toolbar',
            'hks-navigator',
        ],
        variants: [
            { id: 'default', title: 'Workspace' },
            { id: 'state', title: 'State mode' },
        ],
        controls: ['label'],
        defaults: { ...defaults, label: 'Example window' },
        height: 520,
        action: null,
        code: 'const canvas = new HksCanvas();\nconst window = new HksWindow().label(title, icon);\ncanvas.append(window);\nconst lifetime$ = merge(\n  canvas.connect$(camera$, variables$, mode$),\n  window.connect$(windowView$),\n);',
        create: ({ args$, variant }) => {
            const element = new HksCanvas();
            const window = new HksWindow().label('Example window', 'M5 4h14v16H5z');
            const sections = new HksSections();
            const seams = new HksSeams();
            const toolbar = new HksToolbar().categories(categoriesOf(Object.values(programs)));
            const navigator = new HksNavigator();
            toolbar.slot = 'launcher';
            navigator.append(toolbar);
            navigator.slot = 'chrome';
            element.append(sections, window, seams, navigator);
            const gestures$ = window.gestures$.pipe(share());
            const frame$ = gestures$.pipe(
                scan(
                    (frame: Frame, event) =>
                        event.kind === 'move'
                            ? moved(frame, event.dx, event.dy)
                            : event.kind === 'resize'
                              ? resized(frame, event.edge, event.dx, event.dy)
                              : frame,
                    { x: 30, y: 90, z: 1, width: 250, height: 230 },
                ),
                startWith({ x: 30, y: 90, z: 1, width: 250, height: 230 }),
            );
            const camera$ = element.gestures$.pipe(
                scan(
                    (camera, event) =>
                        event.kind === 'pan'
                            ? panned(camera, event.dx, event.dy)
                            : zoomedAround(camera, event.factor, event.at),
                    IDENTITY,
                ),
                startWith(IDENTITY),
                shareReplay({ bufferSize: 1, refCount: true }),
            );
            const linked$ = seams.toggles$.pipe(
                scan(linked => !linked, false),
                startWith(false),
            );
            const open$ = navigator.toggles$.pipe(
                scan(open => !open, false),
                startWith(false),
            );
            return {
                element,
                run$: merge(
                    element.connect$(camera$, of(new Map()), of(variant === 'state')),
                    window.connect$(
                        frame$.pipe(map(frame => ({ kind: 'floating', frame, focused: true }))),
                        of([
                            {
                                id: 'example',
                                name: 'Example',
                                colour: 'var(--accent)',
                                users: 1,
                                current: true,
                            },
                        ]),
                        of(null),
                        of(null),
                        of(variant === 'state'),
                    ),
                    args$.pipe(
                        tap(args => {
                            window.label(args.label, 'M5 4h14v16H5z');
                        }),
                    ),
                    sections.connect$(
                        of([
                            {
                                id: 'section-1',
                                name: 'An isolated workspace',
                                x: 12,
                                y: 64,
                                width: 290,
                                height: 288,
                            },
                        ]),
                    ),
                    seams.connect$(
                        linked$.pipe(
                            map(linked => [
                                { a: 'one', b: 'two', x: 280, y: 205, vertical: true, linked },
                            ]),
                        ),
                    ),
                    toolbar.connect$(),
                    navigator.connect$(
                        of({
                            windows: [{ x: 40, y: 35, width: 90, height: 70 }],
                            sections: [],
                            view: { x: 0, y: 0, width: 240, height: 140 },
                        }),
                        of('100%'),
                        open$,
                        of({ undo: true, redo: false }),
                        of(variant === 'state'),
                    ),
                ),
                events$: merge(
                    gestures$.pipe(map(event => recorded('window', event))),
                    sections.gestures$.pipe(map(event => recorded('section', event))),
                    seams.toggles$.pipe(map(event => recorded('seam', event))),
                    toolbar.launches$.pipe(map(id => recorded('launch', id))),
                    navigator.zooms$.pipe(map(command => recorded('zoom', command))),
                    navigator.edits$.pipe(map(edit => recorded('edit', edit))),
                ),
            };
        },
    },
    {
        id: 'palette',
        title: 'Command palette',
        group: 'Workspace',
        description:
            'Searchable commands with keyboard navigation and argument completion. Open the preview to try it.',
        elements: ['hks-palette'],
        variants: normal,
        controls: [],
        defaults,
        height: 450,
        action: 'Open palette',
        code: 'const palette = new HksPalette();\nconst lifetime$ = palette.connect$(commands$, open$);\nconst requests$ = palette.picks$;',
        create: ({ actions$ }) => {
            const element = new HksPalette();
            const picks$ = element.picks$.pipe(share());
            const open$ = merge(
                actions$.pipe(map(() => true)),
                element.closes$.pipe(map(() => false)),
                picks$.pipe(map(() => false)),
            ).pipe(startWith(false), shareReplay({ bufferSize: 1, refCount: true }));
            return {
                element,
                run$: element.connect$(
                    of([
                        { id: 'new-ticket', label: 'New ticket', hint: 'Plan', keyword: null },
                        { id: 'new-note', label: 'New note', hint: 'Plan', keyword: null },
                        { id: 'find', label: 'Find a ticket…', hint: 'Search', keyword: 'find' },
                    ]),
                    open$,
                ),
                events$: picks$.pipe(map(pick => recorded('pick', pick))),
            };
        },
    },
    {
        id: 'placement',
        title: 'Placement ghost',
        group: 'Workspace',
        description:
            'A blueprint silhouette and placement hint. Click to place or right-click to cancel; requests are logged.',
        elements: ['hks-placement'],
        variants: normal,
        controls: [],
        defaults,
        height: 380,
        action: 'Show ghost',
        code: 'const placement = new HksPlacement();\nconst lifetime$ = placement.connect$(ghost$);\nconst requests$ = placement.changes$;',
        create: ({ actions$ }) => {
            const element = new HksPlacement();
            const events$ = element.changes$.pipe(share());
            const ghost = {
                name: 'A small workspace',
                section: { x: 35, y: 45, width: 300, height: 190 },
                windows: [
                    { x: 50, y: 70, width: 120, height: 140 },
                    { x: 180, y: 70, width: 140, height: 140 },
                ],
            };
            return {
                element,
                run$: element.connect$(
                    merge(
                        actions$.pipe(map(() => ghost)),
                        events$.pipe(map(event => (event.kind === 'move' ? ghost : null))),
                    ).pipe(startWith(ghost)),
                ),
                events$: events$.pipe(map(event => recorded(event.kind, event))),
            };
        },
    },
    {
        id: 'wiring',
        title: 'State sockets & wires',
        group: 'Workspace',
        description:
            'State-mode jacks and compact store selection in their distinct wiring appearance. Hover or focus a jack to inspect its choices.',
        elements: ['hks-state-wiring'],
        variants: normal,
        controls: [],
        defaults,
        height: 270,
        action: null,
        code: 'const wiring = new HksStateWiring();\nconst lifetime$ = wiring.connect$(wiringView$);\nconst requests$ = wiring.changes$;',
        create: () => {
            const element = new HksStateWiring();
            return {
                element,
                run$: element.connect$(
                    of({
                        groups: [],
                        sockets: [
                            {
                                key: 'output',
                                window: 'source',
                                x: 20,
                                y: 50,
                                width: 150,
                                menu: { above: false, height: 90 },
                                title: 'Signal',
                                colour: 'var(--accent)',
                                end: {
                                    kind: 'store',
                                    id: 'signal-example',
                                    program: 'signal',
                                    feeds: 'signal',
                                },
                                receiver: null,
                                current: 'signal-example',
                                optional: false,
                                options: [
                                    {
                                        id: 'signal-example',
                                        name: 'Sine',
                                        colour: 'var(--accent)',
                                        source: 'signal',
                                    },
                                ],
                                group: null,
                                hidden: false,
                            },
                            {
                                key: 'input',
                                window: 'sink',
                                x: 250,
                                y: 140,
                                width: 150,
                                menu: { above: false, height: 90 },
                                title: 'Knob 1',
                                colour: 'var(--accent)',
                                end: {
                                    kind: 'port',
                                    owner: 'window',
                                    sink: 'sketch-example',
                                    input: 'k1',
                                    accepts: ['signal'],
                                    cuttable: true,
                                },
                                receiver: null,
                                current: 'signal-example',
                                optional: true,
                                options: [
                                    {
                                        id: 'signal-example',
                                        name: 'Sine',
                                        colour: 'var(--accent)',
                                        source: 'signal',
                                    },
                                ],
                                group: null,
                                hidden: false,
                            },
                        ],
                        wires: [
                            {
                                path: 'M160 64 C210 64 210 154 260 154',
                                colour: 'var(--accent)',
                                shared: false,
                            },
                        ],
                    }),
                ),
                events$: element.changes$.pipe(map(event => recorded(event.kind, event))),
            };
        },
    },
];
