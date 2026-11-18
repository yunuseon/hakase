import type { DocumentAction } from './documents.ts';
import type { AppSignal } from './process.ts';
import { settingsKey } from './stores.ts';

export const documentActionsOf = ({
    program,
    store,
    from: id,
    input,
}: AppSignal): DocumentAction[] => {
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
        case 'converter':
            return [{ kind: 'converters', store, command: input.command }];
        case 'box':
            return [{ kind: 'boxes', store, command: input.command }];
        case 'unbox':
            return [{ kind: 'unbox', id }];
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
            return [{ kind: 'formula', formula: input.formula, text: input.text, from: id }];
        case 'theme':
            return [{ kind: 'theme', theme: input.theme, value: input.value, from: id }];
        case 'appearance':
            return [{ kind: 'appearance', name: input.name, value: input.value, from: id }];
        case 'look':
            return [{ kind: 'look', name: input.name }];
        case 'aspect':
            return [{ kind: 'aspect', aspect: input.aspect }];
        case 'wires':
            return [{ kind: 'wires', wires: input.wires }];
        case 'prune':
            return [{ kind: 'prune' }];
        case 'convert':
            return [input.command];
        default:
            return [];
    }
};
