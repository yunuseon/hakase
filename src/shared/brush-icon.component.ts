import { svg, html } from 'lit-html';
import { when } from 'lit-html/directives/when.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';

import { guidesOf, type Symmetry } from './brush.ts';

export const SymmetryIcon = (props: { readonly symmetry: Symmetry }) =>
    html`<svg class="ui-symmetry-icon" viewBox="0 0 100 100" aria-hidden="true">
        ${when(
            props.symmetry === 'none',
            () => svg`<circle cx="50" cy="50" r="7"></circle>`,
            () =>
                repeat(
                    guidesOf(props.symmetry),
                    item => item,
                    path => svg`<path d=${ifDefined(path)}></path>`,
                ),
        )}
        <circle cx="50" cy="50" r="38" class="rim"></circle>
    </svg>`;
