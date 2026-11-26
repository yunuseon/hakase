import { html, svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { ICONS } from './icons.ts';

export const Icon = (path: string, viewBox = '0 0 24 24') =>
    html`<svg class="ui-glyph" viewBox=${viewBox} aria-hidden="true" focusable="false">
        <path d=${path}></path>
    </svg>`;
export const ListenIcon = () =>
    html`<svg class="ui-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path class="speaker" d=${ICONS.speaker}></path>
        <path class="on" d=${ICONS.sounding}></path>
        <path class="off" d=${ICONS.silent}></path>
    </svg>`;

export type FootprintView = {
    readonly size: { readonly width: number; readonly height: number };
    readonly windows: readonly {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    }[];
};

export const Footprint = ({ size, windows }: FootprintView) =>
    html`<svg
        class="ui-footprint"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
        viewBox=${`0 0 ${size.width} ${size.height}`}
    >
        ${repeat(
            windows,
            (_item, index) => index,
            ({ x, y, width, height }) =>
                svg`<rect x=${ifDefined(x)} y=${ifDefined(y)} width=${ifDefined(width)} height=${ifDefined(height)} rx=${ifDefined(Math.min(width, height) * 0.06)}></rect>`,
        )}
    </svg>`;
