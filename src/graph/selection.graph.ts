import { merge, type Observable } from 'rxjs';
import {
    filter,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    withLatestFrom,
} from 'rxjs/operators';
import { blueprintOf, type Blueprint } from '../blueprints.ts';
import { worldRectangle } from '../components/section-drawing/section-drawing.ts';
import { viewport$ } from '../lib/rx.ts';
import { idle, reducePlacing, type PlacingAction } from '../placing.ts';
import type { AppSignal, ProcessSignal } from '../process.ts';
import type { ProcessId } from '../program.ts';
import { selectedIn } from '../selection.ts';
import { centreOf } from '../shared/camera.ts';
import type { Chrome } from './chrome.graph.ts';
import type { Intents } from './intents.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

type Reads = Pick<Chrome, 'canvas' | 'placement'> &
    Pick<Intents, 'drawing$' | 'selectionCommands$' | 'toolRequests$'> &
    Pick<Projections, 'workspace$' | 'documents$'> &
    Pick<Timekeeping, 'playbacks$'> & {
        readonly signals$: Observable<ProcessSignal>;
        readonly inputs$: Observable<AppSignal>;
    };

const noSelection: readonly ProcessId[] = [];

export const selectionOf = ({
    canvas,
    placement,
    drawing$,
    selectionCommands$,
    toolRequests$,
    workspace$,
    documents$,
    playbacks$,
    signals$,
    inputs$,
}: Reads) => {
    const selectedIds$ = merge(
        drawing$.pipe(
            mergeMap(drawing =>
                drawing.mode === 'done' && drawing.tool === 'select' ? [drawing] : [],
            ),
            withLatestFrom(workspace$),
            map(([drawing, workspace]) => ({
                kind: 'replace' as const,
                ids: selectedIn(workspace, worldRectangle(drawing.rect, workspace.camera)),
            })),
        ),
        merge(canvas.escapes$, selectionCommands$.pipe(filter(c => c === 'clear'))).pipe(
            map(() => ({ kind: 'replace' as const, ids: noSelection })),
        ),
        signals$.pipe(
            mergeMap(signal =>
                signal.to === 'toggle-selection'
                    ? [{ kind: 'toggle' as const, id: signal.id }]
                    : [],
            ),
        ),
    ).pipe(
        scan((ids: readonly ProcessId[], action) => {
            if (action.kind === 'replace') return action.ids;
            return ids.includes(action.id)
                ? ids.filter(id => id !== action.id)
                : [...ids, action.id];
        }, noSelection),
        startWith(noSelection),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const captures$ = selectionCommands$.pipe(
        filter(command => command === 'copy' || command === 'save'),
        withLatestFrom(selectedIds$, documents$, playbacks$),
        map(([command, ids, documents, clocks]) => ({
            command,
            blueprint: blueprintOf(documents, clocks, ids, `Selection (${ids.length} programs)`),
        })),
        share(),
    );
    const clipboard$ = captures$.pipe(
        filter(capture => capture.command === 'copy'),
        mergeMap(({ blueprint }): Blueprint[] =>
            blueprint === null ? [] : [{ ...blueprint, id: 'clipboard' }],
        ),
        startWith(null),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const placing$ = merge(
        inputs$.pipe(
            mergeMap(({ input }) => (input.kind === 'place-blueprint' ? [input.id] : [])),
            withLatestFrom(viewport$),
            map(([blueprint, viewport]): PlacingAction => ({
                kind: 'start',
                blueprint,
                at: centreOf(viewport),
            })),
        ),
        selectionCommands$.pipe(
            filter(command => command === 'paste'),
            withLatestFrom(clipboard$, viewport$),
            mergeMap(([, blueprint, viewport]): PlacingAction[] =>
                blueprint === null ? [] : [{ kind: 'start', blueprint, at: centreOf(viewport) }],
            ),
        ),
        toolRequests$.pipe(map((): PlacingAction => ({ kind: 'cancel' }))),
        canvas.blurs$.pipe(map((): PlacingAction => ({ kind: 'cancel' }))),
        placement.changes$,
    ).pipe(
        scan(reducePlacing, idle),
        startWith(idle),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    return { selectedIds$, captures$, clipboard$, placing$ };
};

export type Selection = ReturnType<typeof selectionOf>;
