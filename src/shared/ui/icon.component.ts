import { html } from 'lit-html';
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
