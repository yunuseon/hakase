import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { sameTaskRows, type TaskRow } from './task-manager.ts';
import css from './task-manager.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `
    <div class="rows" role="list" aria-label="open windows"></div>
    <p class="empty">Nothing is open.</p>
    <footer class="foot">
        <span class="count"></span>
        <button class="close-all" type="button">Close all</button>
    </footer>
`;

const JUMP =
    'M12 4 V8 M12 16 V20 M4 12 H8 M16 12 H20 M12 12 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0';
const CLOSE = 'M7 7 L17 17 M17 7 L7 17';

// Built as nodes, not markup: an icon is path data, never HTML.
const iconOf = (d: string): SVGSVGElement => {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);

    return svg;
};

const buttonOf = (className: string, action: string, id: string, label: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset[action] = id;
    button.title = label;
    button.setAttribute('aria-label', label);

    return button;
};

const rowOf = ({ id, label, icon, focused }: TaskRow): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'listitem');
    row.toggleAttribute('data-focused', focused);

    const jump = buttonOf('jump', 'reveal', id, `go to ${label}`);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = label;
    jump.append(iconOf(icon), name, iconOf(JUMP));

    const close = buttonOf('close', 'close', id, `close ${label}`);
    close.append(iconOf(CLOSE));

    row.append(jump, close);

    return row;
};

const clicked$ = (element: HTMLElement, key: string): Observable<string> =>
    fromElementEvent$(element, 'click').pipe(
        mergeMap(event => {
            const target =
                event.target instanceof Element ? event.target.closest(`[data-${key}]`) : null;
            const value = target instanceof HTMLElement ? target.dataset[key] : undefined;

            return value === undefined ? EMPTY : of(value);
        }),
    );

export class HksTaskManager extends HTMLElement {
    readonly reveals$: Observable<string>;
    readonly closes$: Observable<string>;
    readonly closeAlls$: Observable<void>;

    private readonly rows: HTMLElement;
    private readonly count: HTMLElement;
    private readonly closeAll: HTMLButtonElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.rows = requireChild(shadow, '.rows');
        this.reveals$ = clicked$(this.rows, 'reveal');
        this.count = requireChild(shadow, '.count');
        this.closeAll = requireElement(shadow, '.close-all', HTMLButtonElement);
        this.closes$ = clicked$(this.rows, 'close');
        this.closeAlls$ = fromElementEvent$(this.closeAll, 'click').pipe(map(() => undefined));
    }

    // closable, not rows.length: only the program knows which row is the manager itself.
    connect$(
        rows$: Observable<readonly TaskRow[]>,
        closable$: Observable<number>,
    ): Observable<void> {
        return merge(
            rows$.pipe(
                distinctUntilChanged(sameTaskRows),
                tap(rows => {
                    this.rows.replaceChildren(...rows.map(rowOf));
                }),
            ),
            closable$.pipe(
                distinctUntilChanged(),
                tap(closable => {
                    this.count.textContent =
                        closable === 1 ? '1 other window' : `${closable} other windows`;
                    this.closeAll.disabled = closable === 0;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-task-manager', HksTaskManager);
