import { ICONS } from '../../shared/ui/icons.ts';
import { Icon } from '../../shared/ui/icon.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../shared/select/select.component.ts';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { isPriority, PRIORITIES } from '../../shared/tickets.ts';
import type { CreationChange, CreatorView } from './ticket-creator.ts';
import css from './ticket-creator.css?inline';

const sheet = styleSheet(css);

export class HksTicketCreator extends HTMLElement {
    readonly changes$: Observable<CreationChange>;
    private readonly root: HTMLDialogElement;

    private readonly rendering: RenderView<CreatorView | null>;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<CreatorView | null>(
            shadow,
            null,
            view =>
                html`<dialog aria-labelledby="heading">
                    <form novalidate>
                        <header>
                            <div>
                                <p class="eyebrow">New ticket</p>
                                <h2 id="heading" tabindex="-1">
                                    ${
                                        view?.state.step === 2
                                            ? 'Review'
                                            : view?.state.step === 1
                                              ? 'Tags & links'
                                              : 'Basics'
                                    }
                                </h2>
                            </div>
                            <button
                                class="ui-icon"
                                type="button"
                                data-action="cancel"
                                aria-label="cancel ticket creation"
                                title="Cancel"
                            >
                                ${Icon(ICONS.close)}
                            </button>
                        </header>
                        <ol class="steps" aria-label="creation steps">
                            ${['1 Basics', '2 Tags & links', '3 Review'].map(
                                (label, index) =>
                                    html`<li
                                        aria-current=${ifDefined(view?.state.step === index ? 'step' : 'false')}
                                    >
                                        ${label}
                                    </li>`,
                            )}
                        </ol>
                        <div class="body">
                            <section data-step="0" ?hidden=${view?.state.step !== 0}>
                                <label
                                    >Title${' '}<input
                                        class="ui-field title"
                                        .value=${view?.state.draft.title ?? ''}
                                        aria-invalid=${ifDefined(view?.state.error !== '')}
                                        aria-label="ticket title"
                                        placeholder="What needs to happen?"
                                        autocomplete="off"
                                        autofocus
                                        required /></label
                                ><label
                                    >Description${' '}<textarea
                                        class="ui-field description"
                                        .value=${view?.state.draft.description ?? ''}
                                        aria-label="ticket description"
                                        rows="4"
                                        placeholder="Context, requirements, or acceptance criteria…"
                                    ></textarea>
                                </label>
                                <div class="pair">
                                    <label
                                        >Status${' '}<hks-select
                                            class="ui-field status"
                                            aria-label="ticket status"
                                            .value=${view?.status ?? ''}
                                            >${repeat(
                                                view?.statuses ?? [],
                                                (_item, index) => index,
                                                status =>
                                                    html`<option .value=${status.id}>
                                                        ${status.title}
                                                    </option>`,
                                            )}</hks-select
                                        ></label
                                    ><label
                                        >Priority${' '}<hks-select
                                            class="ui-field priority"
                                            aria-label="ticket priority"
                                            .value=${view?.state.draft.priority ?? 'none'}
                                            >${PRIORITIES.map(
                                                priority =>
                                                    html`<option .value=${priority}>
                                                        ${
                                                            priority === 'none'
                                                                ? 'No priority'
                                                                : priority
                                                        }
                                                    </option>`,
                                            )}</hks-select
                                        ></label
                                    >
                                </div>
                            </section>
                            <section data-step="1" ?hidden=${view?.state.step !== 1}>
                                <p class="ui-hint hint">
                                    Categorise this ticket and connect related work. All fields here
                                    are optional.
                                </p>
                                <slot name="tags"></slot><slot name="parent"></slot
                                ><slot name="blockers"></slot>
                            </section>
                            <section data-step="2" ?hidden=${view?.state.step !== 2}>
                                <p class="ui-hint hint">
                                    Check the details before creating your ticket.
                                </p>
                                <dl class="review">
                                    ${repeat(
                                        view?.summary ?? [],
                                        (_item, index) => index,
                                        row =>
                                            html`<dt>${row.label}</dt>
                                                <dd>${row.value}</dd>`,
                                    )}
                                </dl>
                            </section>
                            <p class="error" role="alert" ?hidden=${!view?.state.error}>
                                ${view?.state.error}
                            </p>
                        </div>
                        <footer>
                            <button
                                class="ui-icon"
                                type="button"
                                class="ui-icon back"
                                ?hidden=${view?.state.step === 0}
                                data-action="back"
                                aria-label="back"
                                title="Back"
                            >
                                ${Icon(ICONS.back)}</button
                            ><span></span
                            ><button
                                class="ui-icon advance"
                                type="submit"
                                data-final=${ifDefined(view?.state.step === 2 ? '' : undefined)}
                                aria-label=${ifDefined(view?.state.step === 2 ? 'create ticket' : 'next')}
                                title=${ifDefined(view?.state.step === 2 ? 'Create ticket' : 'Next')}
                            >
                                ${Icon(view?.state.step === 2 ? ICONS.check : ICONS.forward)}
                            </button>
                        </footer>
                    </form>
                </dialog>`,
        );
        this.root = requireElement(shadow, 'dialog', HTMLDialogElement);
        const form = requireElement(shadow, 'form', HTMLFormElement);
        this.changes$ = merge(
            fromElementEvent$(form, 'input').pipe(
                mergeMap(({ target }): CreationChange[] =>
                    target instanceof HTMLInputElement && target.classList.contains('title')
                        ? [{ kind: 'title', value: target.value }]
                        : target instanceof HTMLTextAreaElement
                          ? [{ kind: 'description', value: target.value }]
                          : [],
                ),
            ),
            fromElementEvent$(form, 'change').pipe(
                mergeMap(({ target }): CreationChange[] =>
                    target instanceof HksSelect
                        ? target.classList.contains('status')
                            ? [{ kind: 'status', value: target.value }]
                            : isPriority(target.value)
                              ? [{ kind: 'priority', value: target.value }]
                              : []
                        : [],
                ),
            ),
            fromElementEvent$(form, 'click').pipe(
                mergeMap(({ target }): CreationChange[] => {
                    const button =
                        target instanceof Element ? target.closest('[data-action]') : null;
                    const action = button instanceof HTMLElement ? button.dataset['action'] : null;
                    return action === 'cancel' || action === 'back' ? [{ kind: action }] : [];
                }),
            ),
            fromElementEvent$(form, 'submit').pipe(
                tap(event => {
                    event.preventDefault();
                }),
                map((): CreationChange => ({ kind: 'advance' })),
            ),
            fromElementEvent$(this.root, 'cancel').pipe(
                tap(event => {
                    event.preventDefault();
                }),
                map((): CreationChange => ({ kind: 'cancel' })),
            ),
        );
    }

    connect$(view$: Observable<CreatorView>): Observable<void> {
        const root = this.root;
        return merge(
            this.rendering.lifetime$,
            merge(
                connectSelects$(root),
                view$.pipe(
                    tap(view => {
                        this.rendering.update(view);
                        const { state } = view;
                        if (state.phase !== 'editing') {
                            if (root.open) {
                                root.close();
                            }
                            return;
                        }
                        const changedStep = root.dataset['step'] !== String(state.step);
                        root.dataset['step'] = String(state.step);
                        if (!root.open) {
                            root.showModal();
                        } else if (changedStep) {
                            requireChild(root, '#heading').focus();
                        }
                        if (state.error !== '') {
                            requireChild(root, '.title').focus();
                        }
                    }),
                    map(() => undefined),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-ticket-creator', HksTicketCreator);
