import { EMPTY, of, type Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { isTextEntry } from '../lib/dom.ts';
import { fromDocumentEvent$ } from '../lib/rx.ts';
import type { TerminalAction } from '../model/terminal.ts';

// Physical key, not character: Alt+T types `†` on macOS.
const TOGGLE = 'KeyT';
const DOCK = 'KeyD';

export const terminalActions$: Observable<TerminalAction> = fromDocumentEvent$('keydown').pipe(
    mergeMap(event => {
        if (event.key === 'Escape') {
            return of<TerminalAction>({ kind: 'close' });
        }

        if (!event.altKey || event.ctrlKey || event.metaKey || isTextEntry(event)) {
            return EMPTY;
        }

        if (event.code !== TOGGLE && event.code !== DOCK) {
            return EMPTY;
        }

        event.preventDefault();

        return of<TerminalAction>({ kind: event.code === DOCK ? 'switch' : 'toggle' });
    }),
);
