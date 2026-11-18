import { merge } from 'rxjs';
import { filter, map, mergeMap, withLatestFrom } from 'rxjs/operators';
import { capturedActions } from '../capture.ts';
import type { DocumentAction } from '../documents.ts';
import { footprintAt } from '../placing.ts';
import { sharedFormulas$ } from '../share.ts';
import { blueprintIn } from '../starters.ts';
import type { Intents } from './intents.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Selection } from './selection.graph.ts';
import type { StateMode } from './state-mode.graph.ts';

type Reads = Pick<Intents, 'picked$' | 'selectionCommands$'> &
    Pick<Projections, 'documents$'> &
    Pick<Selection, 'placing$' | 'captures$' | 'selectedIds$'> &
    Pick<StateMode, 'wiringCommands$'>;

export const documentActions$ = ({
    picked$,
    selectionCommands$,
    selectedIds$,
    documents$,
    placing$,
    captures$,
    wiringCommands$,
}: Reads) =>
    merge(
        wiringCommands$.pipe(
            mergeMap((command): DocumentAction[] =>
                command.kind === 'convert'
                    ? [command]
                    : command.kind === 'source'
                      ? [
                            {
                                kind: 'link',
                                store: command.store,
                                param: command.param,
                                source: command.source,
                            },
                        ]
                      : [],
            ),
        ),
        placing$.pipe(
            mergeMap(placing => (placing.mode === 'dropped' ? [placing] : [])),
            withLatestFrom(documents$),
            mergeMap(([{ blueprint, at }, { blueprints, workspace }]): DocumentAction[] => {
                const chosen =
                    typeof blueprint === 'string' ? blueprintIn(blueprints, blueprint) : blueprint;

                return chosen === undefined
                    ? []
                    : [
                          {
                              ...(typeof blueprint === 'string'
                                  ? { kind: 'place' as const, blueprint }
                                  : { kind: 'paste' as const, blueprint }),
                              view: footprintAt(chosen.size, at, workspace.camera),
                          },
                      ];
            }),
        ),
        selectionCommands$.pipe(
            filter(command => command === 'component'),
            withLatestFrom(selectedIds$),
            map(([, ids]): DocumentAction => ({ kind: 'box', ids })),
        ),
        captures$.pipe(
            mergeMap(({ command, blueprint }): DocumentAction[] =>
                command === 'save' && blueprint !== null
                    ? [{ kind: 'blueprints', command: { kind: 'add', blueprint } }]
                    : [],
            ),
        ),
        sharedFormulas$.pipe(
            map((shared): DocumentAction => ({
                kind: 'library',
                command: { kind: 'import', ...shared },
            })),
        ),
        picked$.pipe(
            mergeMap((picked): DocumentAction[] =>
                picked.kind === 'look'
                    ? [{ kind: 'look', name: picked.name }]
                    : picked.kind === 'wires'
                      ? [{ kind: 'wires', wires: picked.wires }]
                      : [],
            ),
        ),
        picked$.pipe(
            mergeMap(picked => (picked.kind === 'capture' ? [picked] : [])),
            withLatestFrom(documents$),
            mergeMap(([capture, documents]) => capturedActions(capture, documents)),
        ),
    );
