import { EMPTY, merge, of } from 'rxjs';
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
