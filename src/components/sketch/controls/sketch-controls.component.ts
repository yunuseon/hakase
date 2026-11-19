import { controlsSheet, whys$ } from '../../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { renderOptions, type SelectChoice } from '../../../shared/select/options.component.ts';

import { mountView, type RenderView, type Rendering } from '../../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../../shared/select/select.component.ts';
import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, mergeMap, share, startWith, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import { TABS } from '../../../model/sketch/export.ts';
import {
    type ControlChange,
    type ControlsView,
    type KnobView,
    sameKnobViews,
} from '../../../model/sketch/controls.ts';
import { HksProperties } from '../../../shared/ui/properties.component.ts';
import {
    controlChangeOf,
    parameterSections,
    sceneSections,
    VIEW,
    type SceneInput,
} from './sketch-sections.ts';
import css from './sketch-controls.css?inline';

const sheet = styleSheet(css);

const choice = (key: string, label: string) =>
    html`<label class="item"
        ><span class="key">${label}</span
        ><hks-select
            class="ui-field pick"
            data-pick=${ifDefined(key)}
            aria-label=${ifDefined(label)}
        ></hks-select
    ></label>`;

const tabs = () =>
    TABS.map(
        tab =>
            html`<label class="ui-segment segment"
                ><input
                    type="radio"
                    name="tab"
                    .value=${tab}
                    .checked=${tab === 'parameters'}
                /><span>${tab}</span></label
            >`,
    );

const TEMPLATE = () =>
    html`<div class="head">
            <div class="ui-choices segments tabs" role="radiogroup" aria-label="sketch panels">
                ${tabs()}
            </div>
            <div class="document" role="group" aria-label="what the sketch shows">
                ${choice('formula', 'formula')}${choice('theme', 'theme')}
            </div>
        </div>
        <div class="panes">
            <section class="pane" data-pane="parameters" aria-label="the formula's parameters">
                <div class="parameters"></div>
                <p class="empty">
                    This formula reads no knobs. Use k1 to k4 in its code and they appear here.
                </p>
            </section>
            <div class="pane scene" data-pane="scene" hidden></div>
            <div class="pane animation" data-pane="animation" hidden>
                <slot name="animation"></slot>
            </div>
        </div>`;

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

export class HksSketchControls extends HTMLElement {
    readonly changes$: Observable<ControlChange>;
    readonly whys$: Observable<string> = whys$(this);
    readonly resets$: Observable<void>;

    private readonly shadow: ShadowRoot;
    private readonly empty: HTMLElement;
    private readonly parameters: HksProperties;
    private readonly scene: HksProperties;

    private readonly rendering: Rendering;

    private readonly formulaOptions: RenderView<readonly SelectChoice[]>;
    private readonly themeOptions: RenderView<readonly SelectChoice[]>;

    constructor() {
        super();

        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(this.shadow, () => TEMPLATE());

        this.themeOptions = renderOptions(this.pick('theme'));
        this.formulaOptions = renderOptions(this.pick('formula'));
        this.empty = requireChild(this.shadow, '.empty');
        this.parameters = new HksProperties();
        this.scene = new HksProperties();
        requireChild(this.shadow, '.parameters').append(this.parameters);
        requireChild(this.shadow, '.scene').append(this.scene);
        const edits$ = merge(this.parameters.changes$, this.scene.changes$).pipe(share());
        this.resets$ = edits$.pipe(
            filter(({ id }) => id === VIEW),
            map(() => undefined),
        );

        this.changes$ = merge(
            fromElementEvent$(requireChild(this.shadow, '.head'), 'change').pipe(
                mergeMap(({ target }): Observable<ControlChange> => {
                    if (target instanceof HTMLInputElement && target.name === 'tab') {
                        return of({ field: 'tab', value: target.value });
                    }

                    const pick = target instanceof HksSelect ? target.dataset['pick'] : undefined;

                    return target instanceof HksSelect && (pick === 'formula' || pick === 'theme')
                        ? of({ field: pick, value: target.value })
                        : EMPTY;
                }),
            ),
            edits$.pipe(mergeMap(controlChangeOf)),
        );
    }

    presets(themes: readonly PresetOption[]): this {
        this.themeOptions.update(themes);

        return this;
    }

    private pick(key: string): HksSelect {
        return requireElement(this.shadow, `[data-pick="${key}"]`, HksSelect);
    }

    private checkTab(value: string): void {
        for (const radio of this.shadow.querySelectorAll('input[name="tab"]')) {
            if (radio instanceof HTMLInputElement) {
                radio.checked = radio.value === value;
            }
        }
    }

    // Writes every value back: the fold owns them, so a programmatic write raises no event to loop on.
    connect$(
        view$: Observable<ControlsView>,
        knobs$: Observable<readonly KnobView[]>,
        formulas$: Observable<readonly PresetOption[]>,
        driven$: Observable<readonly string[]>,
        live$: Observable<ReadonlyMap<string, string>>,
        chains$: Observable<ReadonlyMap<string, string>> = EMPTY,
    ): Observable<void> {
        // Together: options rebuilt after the value was set would drop the selection.
        const formula$ = combineLatest([formulas$, view$.pipe(map(({ formula }) => formula))]).pipe(
            tap(([options, value]) => {
                const pick = this.pick('formula');
                this.formulaOptions.update(options);
                pick.value = value;
            }),
        );

        const theme$ = view$.pipe(
            map(({ theme }) => theme),
            distinctUntilChanged(),
            tap(value => {
                this.pick('theme').value = value;
            }),
        );

        const input$ = combineLatest([
            view$,
            knobs$.pipe(startWith([]), distinctUntilChanged(sameKnobViews)),
            driven$,
            live$,
            chains$.pipe(startWith(new Map<string, string>())),
        ]).pipe(
            map(([view, knobs, driven, live, chains]): SceneInput => ({
                view,
                knobs,
                driven,
                live,
                chains,
            })),
            share(),
        );

        const emptied$ = knobs$.pipe(
            map(knobs => knobs.length === 0),
            distinctUntilChanged(),
            tap(empty => {
                this.empty.hidden = !empty;
            }),
        );

        const tab$ = view$.pipe(
            map(({ tab }) => tab),
            distinctUntilChanged(),
            tap(tab => {
                this.checkTab(tab);

                for (const pane of this.shadow.querySelectorAll('[data-pane]')) {
                    if (pane instanceof HTMLElement) {
                        pane.hidden = pane.dataset['pane'] !== tab;
                    }
                }
            }),
        );

        return merge(
            this.rendering.lifetime$,
            this.themeOptions.lifetime$,
            this.formulaOptions.lifetime$,
            this.parameters.connect$(input$.pipe(map(parameterSections))),
            this.scene.connect$(input$.pipe(map(sceneSections))),
            merge(connectSelects$(this.shadow), tab$, formula$, theme$, emptied$).pipe(
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-sketch-controls', HksSketchControls);
