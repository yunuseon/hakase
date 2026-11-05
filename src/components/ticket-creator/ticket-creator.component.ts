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

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = `<dialog aria-labelledby="heading"><form novalidate>
            <header><div><p class="eyebrow">New ticket</p><h2 id="heading" tabindex="-1">Basics</h2></div><button type="button" data-action="cancel" aria-label="cancel ticket creation" title="Cancel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
            <ol class="steps" aria-label="creation steps"><li>1 Basics</li><li>2 Tags & links</li><li>3 Review</li></ol>
            <div class="body">
                <section data-step="0"><label>Title <input class="title" aria-label="ticket title" placeholder="What needs to happen?" autocomplete="off" autofocus required /></label>
                <label>Description <textarea class="description" aria-label="ticket description" rows="4" placeholder="Context, requirements, or acceptance criteria…"></textarea></label>
                <div class="pair"><label>Status <hks-select class="status" aria-label="ticket status"></hks-select></label><label>Priority <hks-select class="priority" aria-label="ticket priority">${PRIORITIES.map(priority => `<option value="${priority}">${priority === 'none' ? 'No priority' : priority}</option>`).join('')}</hks-select></label></div></section>
                <section data-step="1" hidden><p class="hint">Categorise this ticket and connect related work. All fields here are optional.</p><slot name="tags"></slot><slot name="parent"></slot><slot name="blockers"></slot></section>
                <section data-step="2" hidden><p class="hint">Check the details before creating your ticket.</p><dl class="review"></dl></section>
                <p class="error" role="alert" hidden></p>
            </div>
            <footer><button type="button" class="back" data-action="back" aria-label="back" title="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg></button><span></span><button class="advance" type="submit" aria-label="next" title="Next"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></footer>
        </form></dialog>`;
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
            connectSelects$(root),
            view$.pipe(
                tap(({ state, status: selectedStatus, statuses, summary }) => {
                    if (state.phase !== 'editing') {
                        if (root.open) {
                            root.close();
                        }
                        return;
                    }
                    const title = requireElement(root, '.title', HTMLInputElement);
                    const description = requireElement(root, '.description', HTMLTextAreaElement);
                    if (title.value !== state.draft.title) {
                        title.value = state.draft.title;
                    }
                    if (description.value !== state.draft.description) {
                        description.value = state.draft.description;
                    }
                    title.setAttribute('aria-invalid', String(state.error !== ''));
                    const status = requireElement(root, '.status', HksSelect);
                    status.replaceChildren(
                        ...statuses.map(each => new Option(each.title, each.id)),
                    );
                    status.value = selectedStatus;
                    requireElement(root, '.priority', HksSelect).value = state.draft.priority;
                    for (const section of root.querySelectorAll('[data-step]')) {
                        if (section instanceof HTMLElement) {
                            section.hidden = section.dataset['step'] !== String(state.step);
                        }
                    }
                    for (const [index, step] of root.querySelectorAll('.steps li').entries()) {
                        step.setAttribute('aria-current', index === state.step ? 'step' : 'false');
                    }
                    requireChild(root, '#heading').textContent =
                        state.step === 0 ? 'Basics' : state.step === 1 ? 'Tags & links' : 'Review';
                    requireElement(root, '.back', HTMLButtonElement).hidden = state.step === 0;
                    const advance = requireChild(root, '.advance');
                    advance.setAttribute('aria-label', state.step === 2 ? 'create ticket' : 'next');
                    advance.title = state.step === 2 ? 'Create ticket' : 'Next';
                    advance.toggleAttribute('data-final', state.step === 2);
                    const path = advance.querySelector('path');
                    path?.setAttribute(
                        'd',
                        state.step === 2 ? 'm5 12 4 4 10-10' : 'M5 12h14m-6-6 6 6-6 6',
                    );
                    const error = requireChild(root, '.error');
                    error.textContent = state.error;
                    error.hidden = state.error === '';
                    requireChild(root, '.review').replaceChildren(
                        ...summary.flatMap(row => {
                            const term = document.createElement('dt');
                            term.textContent = row.label;
                            const value = document.createElement('dd');
                            value.textContent = row.value;
                            return [term, value];
                        }),
                    );
                    const changedStep = root.dataset['step'] !== String(state.step);
                    root.dataset['step'] = String(state.step);
                    if (!root.open) {
                        root.showModal();
                    } else if (changedStep) {
                        requireChild(root, '#heading').focus();
                    }
                    if (state.error !== '') {
                        title.focus();
                    }
                }),
                map(() => undefined),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-ticket-creator', HksTicketCreator);
