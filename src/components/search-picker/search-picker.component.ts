import { combineLatest, merge, type Observable } from 'rxjs';
import { map, mergeMap, share, startWith, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import {
    choicesFor,
    nextChoiceIndex,
    selectionLabel,
    type Choice,
    type PickerView,
} from './search-picker.ts';
import css from './search-picker.css?inline';

const sheet = styleSheet(css);

const pickButton = (choice: Choice, selected: boolean): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['pick'] = choice.value;
    button.setAttribute('aria-pressed', String(selected));
    const label = document.createElement('span');
    label.textContent = choice.label;
    const hint = document.createElement('small');
    hint.textContent = choice.hint;
    button.append(label, hint);

    return button;
};

export class HksSearchPicker extends HTMLElement {
    readonly picks$: Observable<string>;
    private readonly root: HTMLElement;
    private readonly query$: Observable<string>;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = `<div class="picker"><details><summary><span class="title"></span><span class="selection"></span></summary><div class="panel"><div class="search"><input type="search" aria-label="search choices" placeholder="Search…" autocomplete="off" /><button class="clear" type="button" data-pick="" aria-label="clear selection" title="Clear selection"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="results"></div><p class="empty" hidden>No matches</p></div></details></div>`;
        this.root = requireChild(shadow, '.picker');
        const input = requireElement(shadow, 'input', HTMLInputElement);
        this.picks$ = fromElementEvent$(this.root, 'click').pipe(
            mergeMap(({ target }) => {
                const picked = target instanceof Element ? target.closest('[data-pick]') : null;
                return picked instanceof HTMLElement && picked.dataset['pick'] !== undefined
                    ? [picked.dataset['pick']]
                    : [];
            }),
            share(),
        );
        this.query$ = fromElementEvent$(input, 'input').pipe(
            map(() => input.value),
            startWith(''),
        );
    }

    connect$(view$: Observable<PickerView>): Observable<void> {
        const root = this.root;
        const input = requireElement(root, 'input', HTMLInputElement);
        return merge(
            fromElementEvent$(root, 'keydown').pipe(
                mergeMap(event => {
                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
                        return [];
                    }
                    const choices = [...root.querySelectorAll('.results button')].filter(
                        button => button instanceof HTMLButtonElement,
                    );
                    const current = choices.findIndex(button => button === event.target);
                    const target =
                        choices[
                            nextChoiceIndex(
                                current,
                                choices.length,
                                event.key === 'ArrowDown' ? 1 : -1,
                            )
                        ];
                    return target === undefined ? [] : [{ event, target }];
                }),
                tap(({ event, target }) => {
                    event.preventDefault();
                    target.focus();
                }),
            ),
            combineLatest([view$, this.query$]).pipe(
                map(([view, query]) => ({
                    view,
                    query,
                    choices: choicesFor(view, query),
                    label: selectionLabel(view),
                })),
                tap(({ view, query, choices, label }) => {
                    const active = this.shadowRoot?.activeElement;
                    const focused =
                        active instanceof HTMLButtonElement && active.closest('.results') !== null
                            ? active.dataset['pick']
                            : undefined;
                    requireChild(root, '.title').textContent = view.title;
                    requireChild(root, '.selection').textContent = label;
                    requireElement(root, '.clear', HTMLButtonElement).hidden =
                        view.selected.length === 0 || view.multiple;
                    input.setAttribute('aria-label', `search ${view.title.toLowerCase()}`);
                    if (input.value !== query) {
                        input.value = query;
                    }
                    const buttons = choices.map(choice =>
                        pickButton(choice, view.selected.includes(choice.value)),
                    );
                    requireChild(root, '.results').replaceChildren(...buttons);
                    if (focused !== undefined) {
                        (
                            buttons.find(button => button.dataset['pick'] === focused) ?? input
                        ).focus();
                    }
                    requireChild(root, '.empty').hidden = choices.length > 0;
                }),
            ),
            fromElementEvent$(root, 'keydown').pipe(
                mergeMap(event =>
                    event.key === 'Escape' &&
                    requireElement(root, 'details', HTMLDetailsElement).open
                        ? [event]
                        : [],
                ),
                tap(event => {
                    event.preventDefault();
                    event.stopPropagation();
                    requireElement(root, 'details', HTMLDetailsElement).open = false;
                    requireChild(root, 'summary').focus();
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-search-picker', HksSearchPicker);
