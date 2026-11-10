import { EMPTY, from, merge, of, type Observable } from 'rxjs';
import { HksImageView } from '../components/image-view/image-view.component.ts';
import { HksPedal } from '../components/pedal/pedal.component.ts';
import type { PedalView } from '../components/pedal/pedal.ts';
import { defaultPedal, PEDALS, reducePedal, valueOf } from '../pedals.ts';
import type { Shown } from '../components/image-view/image-view.ts';
import { filter, map, scan, share, shareReplay, startWith, withLatestFrom } from 'rxjs/operators';
import { HksTicketCreator } from '../components/ticket-creator/ticket-creator.component.ts';
import {
    closedCreation,
    creatorView,
    creationCommand,
    reduceCreation,
    type CreationChange,
} from '../components/ticket-creator/ticket-creator.ts';
import { HksSearchPicker } from '../components/search-picker/search-picker.component.ts';
import { draftPickers } from '../ticket-pickers.ts';
import { exampleTickets } from './sandbox.ts';
import {
    HksExportPanel,
    type ExportStatus,
} from '../components/sketch/export/export-panel.component.ts';
import { defaultExport, withExportChange } from '../components/sketch/animation.ts';
import { HksFpsCounter } from '../components/fps-counter/fps-counter.component.ts';
import { HksPreviewError } from '../components/storybook/preview-error.component.ts';
import { defaults, recorded, type Story } from './story.ts';

const gradient = () => {
    const canvas = new OffscreenCanvas(320, 200);
    const context = canvas.getContext('2d');
    const fill = context?.createLinearGradient(0, 0, 320, 200);
    fill?.addColorStop(0, '#2a1d3a');
    fill?.addColorStop(1, '#e8a25a');

    if (context !== null && fill !== undefined) {
        context.fillStyle = fill;
        context.fillRect(0, 0, 320, 200);
    }

    return canvas;
};

export const detailStories: readonly Story[] = [
    {
        id: 'ticket-wizard',
        title: 'Ticket creation wizard',
        group: 'Planning',
        description:
            'The actual three-step dialog and its slotted tag, parent and blocker pickers. Creating a ticket emits an example command only.',
        elements: ['hks-ticket-creator', 'hks-search-picker'],
        variants: [{ id: 'default', title: 'Default' }],
        controls: ['label'],
        defaults: { ...defaults, label: 'A ticket from the component catalogue' },
        height: 220,
        action: 'Open wizard',
        code: 'const creator = new HksTicketCreator();\ncreator.append(tagsPicker, parentPicker, blockersPicker);\nconst lifetime$ = creator.connect$(creatorView$);\nconst changes$ = creator.changes$;',
        create: ({ args$, actions$ }) => {
            const element = new HksTicketCreator();
            const tags = new HksSearchPicker();
            tags.slot = 'tags';
            const parent = new HksSearchPicker();
            parent.slot = 'parent';
            const blockers = new HksSearchPicker();
            blockers.slot = 'blockers';
            element.append(tags, parent, blockers);
            const changes$ = merge(
                actions$.pipe(
                    withLatestFrom(args$),
                    map(([, args]): CreationChange => ({
                        kind: 'open',
                        title: args.label,
                        status: null,
                        parent: null,
                        tags: [],
                    })),
                ),
                element.changes$,
                tags.picks$.pipe(map((value): CreationChange => ({ kind: 'tag', value }))),
                parent.picks$.pipe(map((value): CreationChange => ({ kind: 'parent', value }))),
                blockers.picks$.pipe(map((value): CreationChange => ({ kind: 'blocker', value }))),
            ).pipe(share());
            const creation$ = changes$.pipe(
                scan(reduceCreation, closedCreation),
                startWith(closedCreation),
                shareReplay({ bufferSize: 1, refCount: true }),
            );
            const pickers$ = creation$.pipe(
                map(state => draftPickers(exampleTickets, state.draft)),
            );
            return {
                element,
                run$: merge(
                    element.connect$(
                        creation$.pipe(map(state => creatorView(state, exampleTickets))),
                    ),
                    tags.connect$(pickers$.pipe(map(pickers => pickers.tags))),
                    parent.connect$(pickers$.pipe(map(pickers => pickers.parent))),
                    blockers.connect$(pickers$.pipe(map(pickers => pickers.blockers))),
                ),
                events$: merge(
                    changes$.pipe(map(change => recorded(change.kind, change))),
                    creation$.pipe(
                        filter(state => state.phase === 'submitted'),
                        map(state => recorded('create-ticket', creationCommand(state))),
                    ),
                ),
            };
        },
    },
    {
        id: 'export-controls',
        title: 'Export controls',
        group: 'Creative tools',
        description:
            'Export settings, running progress, cancellation and failure states. This example logs requests without generating files.',
        elements: ['hks-export-panel'],
        variants: [
            { id: 'idle', title: 'Idle' },
            { id: 'running', title: 'Running' },
            { id: 'failed', title: 'Failed' },
        ],
        controls: ['value'],
        defaults,
        height: 210,
        action: null,
        code: 'const exporter = new HksExportPanel();\nconst lifetime$ = exporter.connect$(settings$, summary$, status$, files$);\nconst requests$ = merge(exporter.starts$, exporter.stills$, exporter.cancels$);',
        create: ({ args$, variant }) => {
            const element = new HksExportPanel();
            const changes$ = element.changes$.pipe(share());
            const settings$ = changes$.pipe(
                scan(withExportChange, defaultExport),
                startWith(defaultExport),
            );
            const status$ = args$.pipe(
                map((args): ExportStatus =>
                    variant === 'running'
                        ? { kind: 'running', done: args.value / 100 }
                        : variant === 'failed'
                          ? { kind: 'failed', message: 'Example: the encoder is unavailable.' }
                          : { kind: 'idle' },
                ),
            );
            return {
                element,
                run$: element.connect$(settings$, of('8 seconds · local example'), status$, EMPTY),
                events$: merge(
                    changes$.pipe(map(change => recorded('settings', change))),
                    element.starts$.pipe(map(() => recorded('export', 'requested'))),
                    element.stills$.pipe(map(() => recorded('still', 'requested'))),
                    element.cancels$.pipe(map(() => recorded('cancel', 'requested'))),
                ),
            };
        },
    },
    {
        id: 'fps-readout',
        title: 'Frame-rate readout',
        group: 'System',
        description:
            'The real sampled status readout. Move the Value control to emit sample frames; no background render loop is created.',
        elements: ['hks-fps-counter'],
        variants: [{ id: 'default', title: 'Default' }],
        controls: ['value'],
        defaults,
        height: 110,
        action: null,
        code: 'const counter = new HksFpsCounter();\nconst lifetime$ = counter.connect$(frames$);',
        create: ({ args$ }) => {
            const element = new HksFpsCounter();
            return { element, run$: element.connect$(args$), events$: EMPTY };
        },
    },
    {
        id: 'pedal',
        title: 'Pedal',
        group: 'Controls',
        description:
            'A stage of an image chain: its knobs, a knob a cable drives marked follows, its choice and what each input is plugged into. Each pedal program is this over its row of the PEDALS table.',
        elements: ['hks-pedal'],
        variants: [
            { id: 'kaleido', title: 'Kaleidoscope' },
            { id: 'mix', title: 'Mix, one input unplugged' },
        ],
        controls: [],
        defaults,
        height: 300,
        action: 'changes$',
        code: 'const pedal = new HksPedal();\nconst lifetime$ = pedal.connect$(view$);\nconst commands$ = pedal.changes$;',
        create: ({ variant }) => {
            const element = new HksPedal();
            const kind = variant === 'mix' ? 'mix' : 'kaleido';
            const spec = PEDALS[kind];
            const view$ = element.changes$.pipe(
                scan(reducePedal, defaultPedal(kind)),
                startWith(defaultPedal(kind)),
                map((pedal): PedalView => ({
                    summary: spec.summary,
                    knobs: spec.knobs.map((knob, index) => ({
                        ...knob,
                        value: valueOf(pedal, knob.name),
                        driven: kind === 'kaleido' && index === 1,
                    })),
                    choices: spec.choices,
                    choice: pedal.choice,
                    inputs: spec.inputs.map((name, index) => ({
                        name,
                        from: index === 0 ? 'sketch 2' : null,
                    })),
                })),
            );

            return {
                element,
                run$: element.connect$(view$),
                events$: element.changes$.pipe(map(change => recorded(change.kind, change))),
            };
        },
    },
    {
        id: 'image-view',
        title: 'Image view',
        group: 'System',
        description:
            'Shows what an image cable carries: a bitmap the engine cooked, or a message when nothing is plugged in or the engine failed. Output and every pedal use it.',
        elements: ['hks-image-view'],
        variants: [
            { id: 'frame', title: 'Picture' },
            { id: 'empty', title: 'Nothing plugged in' },
            { id: 'failed', title: 'Engine failed' },
        ],
        controls: [],
        defaults,
        height: 260,
        action: null,
        code: 'const view = new HksImageView();\nconst lifetime$ = view.connect$(shown$);\nconst sizes$ = view.sizes$;',
        create: ({ variant }) => {
            const element = new HksImageView();
            const shown$: Observable<Shown> =
                variant === 'empty'
                    ? of({
                          kind: 'message',
                          text: 'Nothing plugged in. In state mode, wire a sketch into in.',
                      })
                    : variant === 'failed'
                      ? of({ kind: 'message', text: 'This browser does not support WebGL2' })
                      : from(createImageBitmap(gradient())).pipe(
                            map((bitmap): Shown => ({ kind: 'frame', bitmap })),
                        );

            return { element, run$: element.connect$(shown$), events$: EMPTY };
        },
    },
    {
        id: 'preview-failure',
        title: 'Preview failure',
        group: 'System',
        description:
            'A failed renderer stays contained in its preview, with a clear recovery message.',
        elements: ['hks-preview-error'],
        variants: [{ id: 'default', title: 'Unavailable renderer' }],
        controls: [],
        defaults,
        height: 180,
        action: null,
        code: "const error = new HksPreviewError('The renderer is unavailable.');\nconst lifetime$ = error.lifetime$;",
        create: () => {
            const element = new HksPreviewError('The renderer is unavailable in this example.');
            return { element, run$: element.lifetime$, events$: EMPTY };
        },
    },
];
