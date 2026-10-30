import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerDelta$ } from '../../shared/drag.ts';
import { RESIZE_EDGES, type ResizeEdge, type WindowGesture, type WindowView } from './frame.ts';
import css from './window.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `
    <div class="title">
        <span class="glyph"></span>
        <span class="name"></span>
        <button class="close" type="button" aria-label="quit">
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3.5 3.5 L8.5 8.5 M8.5 3.5 L3.5 8.5"/>
            </svg>
        </button>
    </div>
    <div class="body"><slot></slot></div>
`;

const sameView = (a: WindowView, b: WindowView): boolean =>
    a.kind === b.kind && a.frame === b.frame && a.focused === b.focused;

export class HksWindow extends HTMLElement {
    readonly gestures$: Observable<WindowGesture>;

    private readonly name: HTMLElement;
    private readonly glyph: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        for (const edge of RESIZE_EDGES) {
            const handle = document.createElement('div');
            handle.className = `handle handle--${edge}`;
            shadow.appendChild(handle);
        }

        this.name = requireChild(shadow, '.name');
        this.glyph = requireChild(shadow, '.glyph');

        const resize = (edge: ResizeEdge) =>
            pointerDelta$(requireChild(shadow, `.handle--${edge}`)).pipe(
                map(({ dx, dy }): WindowGesture => ({ kind: 'resize', edge, dx, dy })),
            );

        this.gestures$ = merge(
            pointerDelta$(requireChild(shadow, '.title')).pipe(
                map(({ dx, dy }): WindowGesture => ({ kind: 'move', dx, dy })),
            ),
            ...RESIZE_EDGES.map(resize),
            fromElementEvent$(this, 'pointerdown').pipe(
                map((): WindowGesture => ({ kind: 'raise' })),
            ),
            // The button sits inside the drag handle; its press must not also drag.
            fromElementEvent$(requireChild(shadow, '.close'), 'pointerdown').pipe(
                tap(event => {
                    event.stopPropagation();
                }),
                ignoreElements(),
            ),
            fromElementEvent$(requireChild(shadow, '.close'), 'click').pipe(
                map((): WindowGesture => ({ kind: 'quit' })),
            ),
        );
    }

    // An icon is path data on a 24x24 viewBox, built as nodes so it can never be markup.
    label(title: string, icon: string | null): this {
        this.name.textContent = title;

        if (icon === null) {
            this.glyph.replaceChildren();

            return this;
        }

        const svg = document.createElementNS(SVG, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');

        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', icon);
        svg.append(path);
        this.glyph.replaceChildren(svg);

        return this;
    }

    connect$(view$: Observable<WindowView>): Observable<void> {
        return view$.pipe(
            distinctUntilChanged(sameView),
            tap(({ kind, frame, focused }) => {
                this.toggleAttribute('data-focused', focused);
                this.style.transform = `translate(${frame.x.toFixed(0)}px, ${frame.y.toFixed(0)}px)`;
                this.style.zIndex = frame.z.toFixed(0);

                if (kind === 'fitted') {
                    this.style.removeProperty('width');
                    this.style.removeProperty('height');

                    return;
                }

                this.style.width = `${frame.width.toFixed(0)}px`;
                this.style.height = `${frame.height.toFixed(0)}px`;
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-window', HksWindow);
