import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';

import { renderView, type RenderView } from '../../lib/lit.ts';

export type SelectChoice = { readonly value: string; readonly label: string };

export const renderOptions = (root: HTMLElement): RenderView<readonly SelectChoice[]> =>
    renderView<readonly SelectChoice[]>(root, [], options =>
        repeat(
            options.map(option => option.value),
            item => item,
            value =>
                withValue(
                    options.find(option => option.value === value),
                    option => html`<option .value=${value}>${option.label}</option>`,
                ),
        ),
    );
