import { EMPTY, merge, of, type Observable } from 'rxjs';
import { filter, map, mergeMap, withLatestFrom } from 'rxjs/operators';
import { pickedAction } from '../commands.ts';
import { worldRectangle } from '../components/section-drawing/section-drawing.ts';
import { viewport$ } from '../lib/rx.ts';
import type { AppSignal, ProcessSignal } from '../process.ts';
import type { StateCommand } from '../shared/connections.ts';
import { sectionAction, type WorkspaceAction } from '../workspace.ts';
import type { Chrome } from './chrome.graph.ts';
import type { Intents } from './intents.graph.ts';
import type { Navigation } from './navigation.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Selection } from './selection.graph.ts';
import type { StateMode } from './state-mode.graph.ts';

type Reads = Pick<Chrome, 'canvas' | 'navigator' | 'seams' | 'sections'> &
    Pick<Intents, 'picked$' | 'launches$' | 'zoomSteps$' | 'drawing$' | 'selectionCommands$'> &
    Pick<Projections, 'camera$'> &
    Pick<Selection, 'selectedIds$'> &
    Pick<Navigation, 'located$' | 'flights$'> &
    Pick<StateMode, 'wiringCommands$'> & {
        readonly signals$: Observable<ProcessSignal>;
        readonly inputs$: Observable<AppSignal>;
    };

export const workspaceActions$ = ({
    canvas,
    navigator,
    seams,
    sections,
    picked$,
    launches$,
    zoomSteps$,
    drawing$,
    selectionCommands$,
    camera$,
    selectedIds$,
    located$,
    flights$,
    wiringCommands$,
    signals$,
    inputs$,
}: Reads) => {
    const chromeActions$ = merge(
        seams.toggles$.pipe(map(({ a, b }): WorkspaceAction => ({ kind: 'toggle-link', a, b }))),
        navigator.toggles$.pipe(map((): WorkspaceAction => ({ kind: 'toggle-minimap' }))),
        drawing$.pipe(
            mergeMap(drawing =>
                drawing.mode === 'done' && drawing.tool !== 'select' ? [drawing] : [],
            ),
            withLatestFrom(camera$, viewport$),
            map(([drawing, camera, viewport]): WorkspaceAction => ({
                ...(drawing.tool === 'erase'
                    ? { kind: 'erase-sections' as const }
                    : { kind: 'add-section' as const, viewport }),
                rect: worldRectangle(drawing.rect, camera),
            })),
        ),
        sections.gestures$.pipe(map(sectionAction)),
        picked$.pipe(
            filter(
                picked =>
                    picked.kind !== 'workspace' ||
                    !['add-section', 'erase-sections', 'select-programs', 'paste'].includes(
                        picked.action,
                    ),
            ),
            withLatestFrom(viewport$),
            mergeMap(([picked, viewport]) => {
                const action = pickedAction(picked, viewport);

                return action === null ? EMPTY : of(action);
            }),
        ),
        flights$,
        located$.pipe(map((id): WorkspaceAction => ({ kind: 'raise', id }))),
    );

    return merge(
        launches$,
        zoomSteps$,
        canvas.gestures$,
        merge(canvas.edits$, navigator.edits$).pipe(map((kind): WorkspaceAction => ({ kind }))),
        chromeActions$,
        selectionCommands$.pipe(
            filter(command => command === 'delete'),
            withLatestFrom(selectedIds$),
            map(([, ids]): WorkspaceAction => ({ kind: 'close-selection', ids })),
        ),
        signals$.pipe(
            mergeMap(signal => (signal.to === 'workspace' ? of(signal.action) : EMPTY)),
            withLatestFrom(selectedIds$),
            map(([action, selected]): WorkspaceAction =>
                action.kind === 'move' || action.kind === 'raise'
                    ? { ...action, selected }
                    : action,
            ),
        ),
        inputs$.pipe(
            mergeMap(({ input }) => (input.kind === 'task' ? of(input) : EMPTY)),
            withLatestFrom(viewport$),
            map(([{ command, id }, viewport]): WorkspaceAction =>
                command === 'close' ? { kind: 'quit', id } : { kind: 'reveal', id, viewport },
            ),
        ),
        merge(
            inputs$.pipe(
                mergeMap(({ input }) => (input.kind === 'wiring' ? of(input.command) : EMPTY)),
            ),
            wiringCommands$.pipe(
                mergeMap(
                    (command): Exclude<StateCommand, { kind: 'locate' | 'prune' | 'source' }>[] =>
                        command.kind === 'source' ||
                        command.kind === 'locate' ||
                        command.kind === 'prune'
                            ? []
                            : [command],
                ),
            ),
        ).pipe(
            map((command): WorkspaceAction => {
                switch (command.kind) {
                    case 'connect':
                        return {
                            kind: 'follow',
                            id: command.window,
                            input: command.input,
                            source: command.source,
                            store: command.store,
                        };
                    case 'disconnect':
                        return { kind: 'unfollow', id: command.window, input: command.input };
                    case 'bind':
                        return { kind: 'bind-store', id: command.window, store: command.store };
                }
            }),
        ),
        inputs$.pipe(
            mergeMap(({ input }) => (input.kind === 'travel' ? of(input.offset) : EMPTY)),
            map((offset): WorkspaceAction => ({ kind: 'travel', offset })),
        ),
        inputs$.pipe(
            mergeMap(({ from, input }) => (input.kind === 'close-others' ? of(from) : EMPTY)),
            map((keep): WorkspaceAction => ({ kind: 'close-others', keep })),
        ),
    );
};
