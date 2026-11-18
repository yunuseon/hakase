import { EMPTY, of, type Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './controls.css?inline';

export const controlsSheet = styleSheet(css);

// Read through composedPath: a click inside a shadow root reaches the host retargeted to the host.
export const whys$ = (host: HTMLElement): Observable<string> =>
    fromElementEvent$(host, 'click').pipe(
        mergeMap(event => {
            const [target] = event.composedPath();
            const input =
                target instanceof Element
                    ? target.closest('[data-why]')?.getAttribute('data-why')
                    : undefined;

            return input === undefined || input === null ? EMPTY : of(input);
        }),
    );
