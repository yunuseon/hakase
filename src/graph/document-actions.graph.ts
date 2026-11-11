import { merge, type Observable } from 'rxjs';
import { map, mergeMap, withLatestFrom } from 'rxjs/operators';
import { capturedActions } from '../capture.ts';
import type { DocumentAction } from '../documents.ts';
import { footprintAt } from '../placing.ts';
import type { AppSignal } from '../process.ts';
import { sharedFormulas$ } from '../share.ts';
import { blueprintIn } from '../starters.ts';
import { settingsKey } from '../stores.ts';
import type { Intents } from './intents.graph.ts';
import type { Projections } from './projections.graph.ts';
import type { Selection } from './selection.graph.ts';
import type { StateMode } from './state-mode.graph.ts';

type Reads = Pick<Intents, 'picked$'> &
    Pick<Projections, 'documents$'> &
    Pick<Selection, 'placing$' | 'captures$'> &
    Pick<StateMode, 'wiringCommands$'> & { readonly inputs$: Observable<AppSignal> };

export const documentActions$ = ({
    picked$,
    documents$,
    placing$,
    captures$,
    wiringCommands$,
    inputs$,
}: Reads) =>
    merge(
        inputs$.pipe(
            mergeMap(({ program, store, from: id, input }): DocumentAction[] => {
                switch (input.kind) {
                    case 'settings':
                        return [
                            {
                                kind: 'settings',
                                key: settingsKey(program, store, id),
                                settings: input.settings,
                            },
                        ];
                    case 'ticket':
                        return [{ kind: 'tickets', store, command: input.command }];
                    case 'note':
                        return [{ kind: 'notes', store, command: input.command }];
                    case 'agenda':
                        return [{ kind: 'agendas', store, command: input.command }];
                    case 'habit':
                        return [{ kind: 'habits', store, command: input.command }];
                    case 'clock':
                        return [{ kind: 'clocks', store, command: input.command }];
                    case 'bookmark':
                        return [{ kind: 'bookmarks', store, command: input.command }];
                    case 'signal':
                        return [{ kind: 'signals', store, command: input.command }];
                    case 'paint':
                        return [{ kind: 'paintings', store, command: input.command }];
                    case 'pen':
                        return [{ kind: 'pens', store, command: input.command }];
                    case 'voice':
                        return [{ kind: 'voices', store, command: input.command }];
                    case 'gate':
                        return [{ kind: 'gates', store, command: input.command }];
                    case 'pedal':
                        return [{ kind: 'pedals', store, command: input.command }];
                    case 'drums':
                        return [{ kind: 'drums', store, command: input.command }];
                    case 'modulate':
                        return [
                            {
                                kind: 'link',
                                store: input.store,
                                param: input.param,
                                source: input.source,
                            },
                        ];
                    case 'library':
                        return [{ kind: 'library', command: input.command }];
                    case 'blueprint':
                        return [{ kind: 'blueprints', command: input.command }];
                    case 'source':
                        return [
                            { kind: 'formula', formula: input.formula, text: input.text, from: id },
                        ];
                    case 'theme':
                        return [
                            { kind: 'theme', theme: input.theme, value: input.value, from: id },
                        ];
                    case 'appearance':
                        return [
                            { kind: 'appearance', name: input.name, value: input.value, from: id },
                        ];
                    case 'look':
                        return [{ kind: 'look', name: input.name }];
                    case 'prune':
                        return [{ kind: 'prune' }];
                    default:
                        return [];
                }
            }),
        ),
        wiringCommands$.pipe(
            mergeMap((command): DocumentAction[] =>
                command.kind === 'source'
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
                picked.kind === 'look' ? [{ kind: 'look', name: picked.name }] : [],
            ),
        ),
        picked$.pipe(
            mergeMap(picked => (picked.kind === 'capture' ? [picked] : [])),
            withLatestFrom(documents$),
            mergeMap(([capture, documents]) => capturedActions(capture, documents)),
        ),
    );
