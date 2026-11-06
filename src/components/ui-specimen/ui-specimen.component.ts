import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { styleSheet, requireChild } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { Icon, ListenIcon } from '../../shared/ui/icon.component.ts';
import { ICONS } from '../../shared/ui/icons.ts';
import { connectChoices$ } from '../../shared/ui/choices.component.ts';
import { SymmetryIcon } from '../../shared/brush-icon.component.ts';
import { SYMMETRIES } from '../../shared/brush.ts';
import { initialSpecimen, type SpecimenChange, type SpecimenView } from './ui-specimen.ts';
import css from './ui-specimen.css?inline';

const sheet = styleSheet(css);
const template = (view: SpecimenView) => {
    switch (view.kind) {
        case 'buttons':
            return html`<div class="row">
                    <button
                        class="ui-button"
                        type="button"
                        data-action="plain"
                        ?disabled=${view.disabled}
                    >
                        ${view.label}</button
                    ><button
                        class="ui-button"
                        data-variant="well"
                        type="button"
                        data-action="well"
                        ?disabled=${view.disabled}
                    >
                        With a well</button
                    ><button
                        class="ui-button"
                        data-tone="accent"
                        type="button"
                        data-action="accent"
                        ?disabled=${view.disabled}
                    >
                        ${Icon(ICONS.check)} Apply</button
                    ><button
                        class="ui-button"
                        data-tone="danger"
                        type="button"
                        data-action="danger"
                        ?disabled=${view.disabled}
                    >
                        ${Icon(ICONS.remove)} Remove
                    </button>
                </div>
                <div class="row">
                    <button
                        class="ui-icon"
                        type="button"
                        data-action="new"
                        aria-label=${view.label}
                        title=${view.label}
                        ?disabled=${view.disabled}
                    >
                        ${Icon(ICONS.add)}</button
                    ><button
                        class="ui-icon"
                        type="button"
                        data-action="reset"
                        aria-label="Reset"
                        title="Reset"
                        ?disabled=${view.disabled}
                    >
                        ${Icon(ICONS.reset)}</button
                    ><button
                        class="ui-icon"
                        type="button"
                        data-tone="danger"
                        data-action="delete"
                        aria-label="Delete"
                        title="Delete"
                        ?disabled=${view.disabled}
                    >
                        ${Icon(ICONS.remove)}
                    </button>
                </div>
                <p class="ui-hint">
                    Quiet icon actions and labelled buttons share one control face.
                </p>`;
        case 'fields':
            return html`<div class="fields">
                <label
                    >${view.label}<input
                        class="ui-field"
                        data-field="text"
                        type="text"
                        aria-label=${view.label}
                        .value=${view.text}
                        placeholder="Write something…"
                        ?disabled=${view.disabled} /></label
                ><label
                    >Search<input
                        class="ui-field"
                        data-field="text"
                        type="search"
                        aria-label="Example search"
                        .value=${view.text}
                        placeholder="Search…"
                        ?disabled=${view.disabled} /></label
                ><label
                    >Description<textarea
                        class="ui-field"
                        data-field="text"
                        aria-label="Example description"
                        .value=${view.text}
                        rows="3"
                        ?disabled=${view.disabled}
                    ></textarea></label
                ><label
                    >Invalid state<input
                        class="ui-field"
                        type="text"
                        aria-label="Example invalid field"
                        aria-invalid="true"
                        aria-describedby="field-error"
                        value="Incomplete"
                        ?disabled=${view.disabled}
                    /><small id="field-error">An example validation message.</small></label
                >
            </div>`;
        case 'choices':
            return html`<h3>${view.label}</h3>
                <div class="ui-choices" role="radiogroup" aria-label=${view.label}>
                    ${['one', 'two', 'three'].map(value => html`<button class="ui-choice" type="button" role="radio" data-choice=${value} aria-checked=${view.choice === value ? 'true' : 'false'} ?disabled=${view.disabled}>${value}</button>`)}<button
                        class="ui-choice"
                        type="button"
                        role="radio"
                        aria-checked="false"
                        disabled
                    >
                        Unavailable
                    </button>
                </div>
                <p class="ui-hint">
                    One tab stop. Arrow keys select; Home and End skip disabled choices.
                </p>
                <h3>Native radio segments</h3>
                <div class="ui-choices" role="radiogroup" aria-label="Native segments">
                    ${['one', 'two', 'three'].map(value => html`<label class="ui-segment"><input type="radio" name="native-choice" data-field="choice" .value=${value} .checked=${view.choice === value} ?disabled=${view.disabled} /><span>${value}</span></label>`)}
                </div>`;
        case 'range':
            return html`<label class="row"
                    >${view.label}<input
                        class="ui-range"
                        data-field="value"
                        type="range"
                        min="0"
                        max="100"
                        .value=${String(view.value)}
                        aria-label=${view.label}
                        ?disabled=${view.disabled}
                    /><output>${view.value}</output></label
                ><label class="row"
                    >Precision<input
                        class="ui-range"
                        data-variant="precision"
                        data-field="value"
                        type="range"
                        min="0"
                        max="100"
                        .value=${String(view.value)}
                        aria-label="Precision range"
                        ?disabled=${view.disabled} /></label
                ><label class="row"
                    ><input
                        class="ui-check"
                        data-field="check"
                        type="checkbox"
                        .checked=${view.checked}
                        ?disabled=${view.disabled}
                    />${view.label}</label
                >`;
        case 'colour':
            return html`<label class="row"
                    >${view.label}<input
                        class="ui-colour"
                        data-field="colour"
                        type="color"
                        aria-label=${view.label}
                        .value=${view.colour}
                        ?disabled=${view.disabled}
                    /><code>${view.colour}</code></label
                ><label class="row"
                    >Rectangular swatch<input
                        class="ui-colour colour-bar"
                        data-variant="rect"
                        data-field="colour"
                        type="color"
                        aria-label="Rectangular colour swatch"
                        .value=${view.colour}
                        ?disabled=${view.disabled}
                /></label>`;
        case 'badges':
            return html`<div class="row">
                    <span class="ui-badge">${view.label}</span
                    ><button
                        class="ui-badge"
                        type="button"
                        data-action="filter"
                        ?disabled=${view.disabled}
                    >
                        ${view.label}</button
                    ><span class="ui-badge"
                        >${view.label}<button
                            class="ui-icon tag-remove"
                            type="button"
                            data-action="untag"
                            aria-label="Remove tag"
                            ?disabled=${view.disabled}
                        >
                            ${Icon(ICONS.close)}
                        </button></span
                    >
                </div>
                <p class="ui-hint">Static, clickable and removable tags use the same badge.</p>`;
        case 'listen':
            return html`<button
                    class="ui-listen"
                    type="button"
                    data-listen
                    aria-pressed=${view.listening ? 'true' : 'false'}
                    ?disabled=${view.disabled}
                >
                    ${ListenIcon()}<span>${view.label}</span>
                </button>
                <p class="ui-hint">A visual toggle only. No audio engine runs in this example.</p>`;
        case 'symmetry':
            return html`<div class="icons symmetry">
                ${SYMMETRIES.map(symmetry => html`<div>${SymmetryIcon({ symmetry })}<code>${symmetry}</code></div>`)}
            </div>`;
        case 'empty':
            return html`<div class="ui-empty">
                <h3>${view.label}</h3>
                <p>Nothing here yet.</p>
                <button
                    class="ui-icon"
                    type="button"
                    data-action="create"
                    aria-label="Create first item"
                    ?disabled=${view.disabled}
                >
                    ${Icon(ICONS.add)}
                </button>
            </div>`;
        default:
            return html`<div class="icons">
                ${repeat(
                    Object.entries(ICONS),
                    ([name]) => name,
                    ([name, path]) => html`<div>${Icon(path)}<code>${name}</code></div>`,
                )}
            </div>`;
    }
};
export class HksUiSpecimen extends HTMLElement {
    readonly changes$: Observable<SpecimenChange>;
    private readonly root: ShadowRoot;
    private readonly rendering: RenderView<SpecimenView>;
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        this.root = root;
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView(
            root,
            initialSpecimen,
            view => html`<div class="frame">${template(view)}</div>`,
        );
        const frame = requireChild(root, '.frame');
        this.changes$ = merge(
            fromElementEvent$(frame, 'input').pipe(
                mergeMap(({ target }): SpecimenChange[] => {
                    if (!(
                        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
                    )) {
                        return [];
                    }
                    const field = target.dataset['field'];
                    return field === 'text' || field === 'colour'
                        ? [{ kind: field, value: target.value }]
                        : field === 'value' && target instanceof HTMLInputElement
                          ? [{ kind: 'value', value: target.valueAsNumber }]
                          : [];
                }),
            ),
            fromElementEvent$(frame, 'change').pipe(
                mergeMap(({ target }): SpecimenChange[] =>
                    target instanceof HTMLInputElement && target.dataset['field'] === 'check'
                        ? [{ kind: 'check', value: target.checked }]
                        : target instanceof HTMLInputElement && target.dataset['field'] === 'choice'
                          ? [{ kind: 'choice', value: target.value }]
                          : [],
                ),
            ),
            fromElementEvent$(frame, 'click').pipe(
                mergeMap(({ target }): SpecimenChange[] => {
                    const button = target instanceof Element ? target.closest('button') : null;
                    if (!(button instanceof HTMLButtonElement) || button.disabled) {
                        return [];
                    }
                    const choice = button.dataset['choice'];
                    const action = button.dataset['action'];
                    return choice !== undefined
                        ? [{ kind: 'choice', value: choice }]
                        : button.hasAttribute('data-listen')
                          ? [{ kind: 'listen' }]
                          : action !== undefined
                            ? [{ kind: 'action', value: action }]
                            : [];
                }),
            ),
        );
    }
    connect$(view$: Observable<SpecimenView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            connectChoices$(this.root),
            view$.pipe(tap(view => this.rendering.update(view))),
        ).pipe(map(() => undefined));
    }
}
customElements.define('hks-ui-specimen', HksUiSpecimen);
