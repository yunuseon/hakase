import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './history.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <ol class="steps" aria-label="history"></ol>
    <footer class="foot"><span class="summary"></span></footer>
`;

export type HistoryEntry = {
    readonly label: string;
    // Steps from where you are: negative is back, positive is forward, 0 is now.
    readonly offset: number;
};

const stepOf = ({ label, offset }: HistoryEntry): HTMLElement => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'step';
    button.dataset['offset'] = String(offset);
    button.dataset['when'] = offset < 0 ? 'past' : offset > 0 ? 'future' : 'now';
    button.setAttribute('aria-current', String(offset === 0));
    button.title =
        offset === 0 ? 'where you are' : offset < 0 ? `back ${-offset}` : `forward ${offset}`;

    const dot = document.createElement('span');
    dot.className = 'dot';

    const text = document.createElement('span');
    text.className = 'label';
    text.textContent = label;

    button.append(dot, text);
    item.append(button);

    return item;
};

const keyOf = (entries: readonly HistoryEntry[]): string =>
    entries.map(({ label, offset }) => `${offset}:${label}`).join('\n');

export class HksHistory extends HTMLElement {
    readonly travels$: Observable<number>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.travels$ = fromElementEvent$(requireChild(shadow, '.steps'), 'click').pipe(
            mergeMap(({ target }) => {
                const step = target instanceof Element ? target.closest('[data-offset]') : null;
                const offset = step instanceof HTMLElement ? Number(step.dataset['offset']) : 0;

                return offset === 0 || !Number.isFinite(offset) ? EMPTY : of(offset);
            }),
        );
    }

    connect$(entries$: Observable<readonly HistoryEntry[]>): Observable<void> {
        const steps = requireChild(this.shadow, '.steps');
        const summary = requireChild(this.shadow, '.summary');

        return merge(
            entries$.pipe(
                distinctUntilChanged((a, b) => keyOf(a) === keyOf(b)),
                tap(entries => {
                    steps.replaceChildren(...entries.map(stepOf));

                    const back = entries.filter(({ offset }) => offset < 0).length;
                    const forward = entries.filter(({ offset }) => offset > 0).length;
                    summary.textContent = `${back} back · ${forward} forward`;

                    steps
                        .querySelector('[aria-current="true"]')
                        ?.scrollIntoView({ block: 'nearest' });
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-history', HksHistory);
