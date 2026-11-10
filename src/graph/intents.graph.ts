import { EMPTY, merge, of } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    withLatestFrom,
} from 'rxjs/operators';
import { pickedOf } from '../commands.ts';
import {
    idleDrawing,
    reduceDrawing,
    type DrawingAction,
} from '../components/section-drawing/section-drawing.ts';
import { viewport$, visibleViewport$ } from '../lib/rx.ts';
import { isProgramId } from '../program.ts';
import { programOf } from '../programs.ts';
import type { WorkspaceAction } from '../workspace.ts';
import type { Chrome } from './chrome.graph.ts';

export const intentsOf = ({
    canvas,
    toolbar,
    navigator,
    palette,
    selection,
    sectionDrawing,
}: Pick<
    Chrome,
    'canvas' | 'toolbar' | 'navigator' | 'palette' | 'selection' | 'sectionDrawing'
>) => {
    const picked$ = palette.picks$.pipe(
        mergeMap(({ id, text }) => {
            const picked = pickedOf(id, text);

            return picked === null ? EMPTY : of(picked);
        }),
        share(),
    );

    const paletteOpen$ = merge(
        palette.opens$.pipe(map(() => 'toggle' as const)),
        merge(palette.closes$, palette.picks$).pipe(map(() => 'close' as const)),
    ).pipe(
        scan((open, command) => (command === 'toggle' ? !open : false), false),
        startWith(false),
        distinctUntilChanged(),
    );

    const launches$ = merge(
        toolbar.launches$,
        picked$.pipe(mergeMap(picked => (picked.kind === 'launch' ? of(picked.program) : EMPTY))),
    ).pipe(
        mergeMap(id => {
            const program = isProgramId(id) ? programOf(id) : undefined;

            return program === undefined ? EMPTY : of(program);
        }),
        withLatestFrom(visibleViewport$),
        map(([program, viewport]): WorkspaceAction => ({
            kind: 'launch',
            program: program.id,
            size: program.size,
            viewport,
        })),
    );

    const zoomSteps$ = merge(navigator.zooms$, canvas.keys$).pipe(
        withLatestFrom(viewport$),
        map(([command, viewport]): WorkspaceAction => ({
            kind: 'zoom-step',
            command,
            viewport,
        })),
    );

    const selectionCommands$ = merge(
        selection.changes$,
        canvas.clipboard$,
        picked$.pipe(
            mergeMap(picked =>
                picked.kind === 'workspace' && picked.action === 'paste' ? ['paste' as const] : [],
            ),
        ),
    ).pipe(share());
    const toolRequests$ = merge(
        navigator.adds$.pipe(map((): DrawingAction => ({ kind: 'start', tool: 'paint' }))),
        navigator.erases$.pipe(map((): DrawingAction => ({ kind: 'start', tool: 'erase' }))),
        navigator.selects$.pipe(map((): DrawingAction => ({ kind: 'start', tool: 'select' }))),
        picked$.pipe(
            mergeMap((picked): DrawingAction[] =>
                picked.kind !== 'workspace'
                    ? []
                    : picked.action === 'add-section'
                      ? [{ kind: 'start', tool: 'paint' }]
                      : picked.action === 'erase-sections'
                        ? [{ kind: 'start', tool: 'erase' }]
                        : picked.action === 'select-programs'
                          ? [{ kind: 'start', tool: 'select' }]
                          : [],
            ),
        ),
    ).pipe(share());
    const drawing$ = merge(
        toolRequests$,
        canvas.selects$.pipe(
            mergeMap(({ phase, event }): DrawingAction[] => {
                if (event.type === 'pointercancel') return [{ kind: 'cancel' }];
                const action: DrawingAction = {
                    kind: phase,
                    at: { x: event.clientX, y: event.clientY },
                };
                return phase === 'grab' ? [{ kind: 'start', tool: 'select' }, action] : [action];
            }),
        ),
        sectionDrawing.changes$,
        merge(canvas.escapes$, canvas.blurs$).pipe(map((): DrawingAction => ({ kind: 'cancel' }))),
        selectionCommands$.pipe(
            filter(c => c === 'paste'),
            map((): DrawingAction => ({ kind: 'cancel' })),
        ),
    ).pipe(
        scan(reduceDrawing, idleDrawing),
        startWith(idleDrawing),
        distinctUntilChanged(),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    return {
        picked$,
        paletteOpen$,
        launches$,
        zoomSteps$,
        selectionCommands$,
        toolRequests$,
        drawing$,
    };
};

export type Intents = ReturnType<typeof intentsOf>;
