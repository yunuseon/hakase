import { controlsSheet, whys$ } from '../../../shared/ui/controls.component.ts';
import { html } from 'lit-html';

import { mountView, type Rendering } from '../../../lib/lit.ts';
import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, mergeMap, share, startWith, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../../lib/dom.ts';
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
    headSections,
    parameterSections,
    sceneSections,
    VIEW,
    type SceneInput,
} from './sketch-sections.ts';
import css from './sketch-controls.css?inline';

const sheet = styleSheet(css);

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
            <div class="document" role="group" aria-label="what the sketch shows"></div>
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
    private readonly document: HksProperties;

    private readonly rendering: Rendering;

    constructor() {
        super();

        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(this.shadow, () => TEMPLATE());

        this.empty = requireChild(this.shadow, '.empty');
        this.parameters = new HksProperties();
        this.scene = new HksProperties();
        requireChild(this.shadow, '.parameters').append(this.parameters);
        requireChild(this.shadow, '.scene').append(this.scene);
        this.document = new HksProperties();
        requireChild(this.shadow, '.document').append(this.document);
        const edits$ = merge(
            this.parameters.changes$,
            this.scene.changes$,
            this.document.changes$,
        ).pipe(share());
        this.resets$ = edits$.pipe(
            filter(({ id }) => id === VIEW),
            map(() => undefined),
        );

        this.changes$ = merge(
            fromElementEvent$(requireChild(this.shadow, '.head'), 'change').pipe(
                mergeMap(({ target }): Observable<ControlChange> => {
                    return target instanceof HTMLInputElement && target.name === 'tab'
                        ? of({ field: 'tab', value: target.value })
                        : EMPTY;
                }),
            ),
            edits$.pipe(mergeMap(controlChangeOf)),
        );
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
        const document$ = combineLatest([view$, formulas$]).pipe(
            map(([view, formulas]) => headSections(view, formulas)),
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
            this.document.connect$(document$),
            this.parameters.connect$(input$.pipe(map(parameterSections))),
            this.scene.connect$(input$.pipe(map(sceneSections))),
            merge(tab$, emptied$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-sketch-controls', HksSketchControls);
