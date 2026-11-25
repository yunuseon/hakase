import { html } from 'lit-html';
import { merge, type Observable } from 'rxjs';
import { debounceTime, map, mergeMap, tap } from 'rxjs/operators';
import { ref } from 'lit-html/directives/ref.js';
import { displayValue, renderView, type RenderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { controlsSheet, whys$ } from '../../shared/ui/controls.component.ts';
import { isSceneTab, SCENE_TABS, type SceneTab } from './scene-sections.ts';
import css from './scene.css?inline';

const sheet = styleSheet(css);

export type SceneControlsView = {
    readonly tab: SceneTab;
    readonly code: string;
    readonly error: string | null;
};

export type SceneControlsEvent =
    | { readonly kind: 'tab'; readonly tab: SceneTab }
    | { readonly kind: 'code'; readonly code: string };

const empty: SceneControlsView = { tab: 'objects', code: '', error: null };

const CODE_HINT =
    'Optional GLSL. Define Hit custom(vec3 p, float t) for every code object, e.g. return hit(sdSphere(p, 1.0), GLASS, 0.9, 0.0);, and Camera camera(float t) to script the camera. k1–k4 and t are in reach.';

const TEMPLATE = ({ tab, code, error }: SceneControlsView) =>
    html`<div class="scene">
        <div class="ui-choices segments tabs" role="radiogroup" aria-label="scene panels">
            ${SCENE_TABS.map(
                each =>
                    html`<label class="ui-segment segment"
                        ><input
                            type="radio"
                            name="tab"
                            .value=${each}
                            .checked=${each === tab}
                        /><span>${each}</span></label
                    >`,
            )}
        </div>
        <div class="pane" ?hidden=${tab !== 'objects'}><slot name="objects"></slot></div>
        <div class="pane code" ?hidden=${tab !== 'code'}>
            <textarea
                class="ui-field source"
                spellcheck="false"
                aria-label="scene code"
                placeholder=${CODE_HINT}
                data-scrolls
                ${ref(element => {
                    if (element instanceof HTMLTextAreaElement) {
                        displayValue(element, code);
                    }
                })}
            ></textarea>
            <pre class="error" ?hidden=${error === null}>${error ?? ''}</pre>
        </div>
        <div class="pane" ?hidden=${tab !== 'render'}><slot name="render"></slot></div>
    </div>`;

export class HksSceneControls extends HTMLElement {
    readonly changes$: Observable<SceneControlsEvent>;
    readonly whys$: Observable<string> = whys$(this);

    private readonly rendering: RenderView<SceneControlsView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'root';
        shadow.append(root);
        this.rendering = renderView(root, empty, TEMPLATE);

        this.changes$ = merge(
            fromElementEvent$(root, 'change').pipe(
                mergeMap(({ target }): SceneControlsEvent[] =>
                    target instanceof HTMLInputElement &&
                    target.name === 'tab' &&
                    isSceneTab(target.value)
                        ? [{ kind: 'tab', tab: target.value }]
                        : [],
                ),
            ),
            fromElementEvent$(root, 'input').pipe(
                mergeMap(({ target }) =>
                    target instanceof HTMLTextAreaElement ? [target.value] : [],
                ),
                debounceTime(300),
                map((code): SceneControlsEvent => ({ kind: 'code', code })),
            ),
        );
    }

    connect$(view$: Observable<SceneControlsView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(
                tap(view => {
                    this.rendering.update(view);
                }),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-scene-controls', HksSceneControls);
