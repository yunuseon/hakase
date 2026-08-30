import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerDelta$ } from '../../shared/drag.ts';
import { RESIZE_EDGES, type ResizeEdge, type WindowGesture, type WindowView } from './frame.ts';
import css from './window.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="title"><span class="name"></span></div>
    <div class="body"><slot></slot></div>
`;

const sameView = (a: WindowView, b: WindowView): boolean =>
    a.kind === b.kind && a.frame === b.frame;

export class HksWindow extends HTMLElement {
    readonly gestures$: Observable<WindowGesture>;

    private readonly name: HTMLElement;

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
        );
    }

    label(title: string): this {
        this.name.textContent = title;

        return this;
    }

    connect$(view$: Observable<WindowView>): Observable<void> {
        return view$.pipe(
            distinctUntilChanged(sameView),
            tap(({ kind, frame }) => {
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
