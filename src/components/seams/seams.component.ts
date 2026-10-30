import { EMPTY, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { sameSeams, type SeamToggle, type SeamView } from './seams.ts';
import css from './seams.css?inline';

const sheet = styleSheet(css);

const seamOf = ({ a, b, x, y, vertical, linked }: SeamView): HTMLElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seam';
    button.dataset['a'] = a;
    button.dataset['b'] = b;
    button.toggleAttribute('data-linked', linked);
    button.toggleAttribute('data-vertical', vertical);
    button.style.transform = `translate(${x}px, ${y}px)`;

    const label = linked ? 'detach windows' : 'attach windows';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(linked));

    return button;
};

export class HksSeams extends HTMLElement {
    readonly toggles$: Observable<SeamToggle>;

    private readonly root: ShadowRoot;

    constructor() {
        super();

        this.root = this.attachShadow({ mode: 'open' });
        this.root.adoptedStyleSheets = [sheet];

        this.toggles$ = fromElementEvent$(this, 'click').pipe(
            mergeMap(event => {
                const seam = event
                    .composedPath()
                    .find(
                        target =>
                            target instanceof HTMLElement && target.classList.contains('seam'),
                    );

                if (!(seam instanceof HTMLElement)) {
                    return EMPTY;
                }

                const { a, b } = seam.dataset;

                return a === undefined || b === undefined ? EMPTY : of({ a, b });
            }),
        );
    }

    connect$(seams$: Observable<readonly SeamView[]>): Observable<void> {
        return seams$.pipe(
            distinctUntilChanged(sameSeams),
            tap(seams => {
                this.root.replaceChildren(...seams.map(seamOf));
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-seams', HksSeams);
