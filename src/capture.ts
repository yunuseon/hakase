import { defaultBoard } from './components/board/board.ts';
import { emptyNotes, nextNoteId } from './components/note/note.ts';
import type { Picked } from './commands.ts';
import type { DocumentAction, Documents } from './documents.ts';

type Capture = Extract<Picked, { readonly kind: 'capture' }>;

// Into each program's main store, the one a new window opens on.
export const capturedActions = (
    { target, text }: Capture,
    { notes, boards }: Pick<Documents, 'notes' | 'boards'>,
): readonly DocumentAction[] => {
    switch (target) {
        case 'todo':
            return [{ kind: 'todos', store: 'todo', command: { kind: 'add', text } }];
        case 'note': {
            const id = nextNoteId(notes.get('note') ?? emptyNotes);

            return [{ kind: 'notes', store: 'note', command: { kind: 'create', id, text } }];
        }
        case 'card': {
            const column = (boards.get('board') ?? defaultBoard).columns[0];

            return column === undefined
                ? []
                : [
                      {
                          kind: 'boards',
                          store: 'board',
                          command: { kind: 'add-card', column: column.id, text },
                      },
                  ];
        }
    }
};
