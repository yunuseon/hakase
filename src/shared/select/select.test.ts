import { describe, expect, it } from 'vitest';
import {
    emptySelect,
    matchingOptions,
    popupPlacement,
    reduceSelect,
    type SelectConfig,
    type SelectSession,
} from './select.ts';

const config: SelectConfig = {
    options: [
        { value: 'a', label: 'Alpha city', disabled: false },
        { value: 'b', label: 'Beta city', disabled: true },
        { value: 'c', label: 'Gamma city', disabled: false },
    ],
    value: 'a',
    disabled: false,
    editable: false,
    label: 'City',
    placeholder: '',
};
const ready = (overrides: Partial<SelectConfig> = {}): SelectSession =>
    reduceSelect(emptySelect, { kind: 'config', config: { ...config, ...overrides } });
const key = (state: SelectSession, key: string): SelectSession =>
    reduceSelect(state, { kind: 'key', key });

describe('custom select', () => {
    it('matches every search word without case sensitivity', () => {
        expect(matchingOptions(config, 'CITY gamma').map(option => option.value)).toEqual(['c']);
        expect(matchingOptions(config, 'missing')).toEqual([]);
    });
    it('opens at the current selection and skips disabled options in both directions', () => {
        const open = reduceSelect(ready(), { kind: 'toggle' });
        expect(open.active).toBe(0);
        expect(key(open, 'ArrowDown').active).toBe(2);
        expect(key(open, 'ArrowUp').active).toBe(2);
        expect(key(key(open, 'ArrowDown'), 'ArrowDown').active).toBe(0);
    });
    it('chooses with Enter and emits a single write effect', () => {
        const chosen = key(key(ready(), 'ArrowUp'), 'Enter');
        expect(chosen).toMatchObject({ open: false, write: 'c', chosen: true, focus: true });
        expect(
            reduceSelect(chosen, { kind: 'config', config: { ...config, value: 'c' } }),
        ).toMatchObject({ write: null, chosen: false });
    });
    it('rejects disabled or missing selections', () => {
        expect(reduceSelect(ready(), { kind: 'choose', value: 'b' }).chosen).toBe(false);
        expect(reduceSelect(ready(), { kind: 'choose', value: 'missing' }).write).toBe(null);
    });
    it('does not open or write when disabled', () => {
        expect(key(ready({ disabled: true }), 'ArrowDown').open).toBe(false);
        expect(reduceSelect(ready({ disabled: true }), { kind: 'query', text: 'a' }).write).toBe(
            null,
        );
    });
    it('opens at the first enabled option when the selected value is unavailable', () => {
        expect(
            reduceSelect(ready({ value: '', options: config.options.slice(1) }), { kind: 'toggle' })
                .active,
        ).toBe(1);
        expect(
            reduceSelect(
                ready({ options: config.options.map(option => ({ ...option, disabled: true })) }),
                { kind: 'toggle' },
            ).active,
        ).toBe(-1);
    });
    it('handles empty results without creating an invalid selection', () => {
        const searched = reduceSelect(ready(), { kind: 'query', text: 'missing' });
        expect(searched.active).toBe(-1);
        expect(key(searched, 'Enter').chosen).toBe(false);
    });
    it('Escape returns focus, while Tab closes and lets focus advance', () => {
        const open = key(ready(), 'ArrowDown');
        expect(key(open, 'Escape')).toMatchObject({ open: false, focus: true, write: null });
        expect(key(open, 'Tab')).toMatchObject({ open: false, focus: false });
    });
    it('supports Home and End without landing on a disabled option', () => {
        expect(key(ready(), 'Home')).toMatchObject({ open: true, active: 0 });
        expect(key(ready(), 'End')).toMatchObject({ open: true, active: 2 });
    });
    it('keeps typed autocomplete text without committing a suggestion', () => {
        const typed = reduceSelect(ready({ editable: true, value: '' }), {
            kind: 'query',
            text: 'Gamma',
        });
        expect(typed).toMatchObject({ query: 'Gamma', write: 'Gamma', active: -1, chosen: false });
        expect(key(typed, 'Enter')).toMatchObject({ open: false, submit: true, chosen: false });
    });
    it('selects an autocomplete suggestion before submitting the form', () => {
        const typed = reduceSelect(ready({ editable: true, value: '' }), {
            kind: 'query',
            text: 'Gamma',
        });
        const chosen = key(key(typed, 'ArrowDown'), 'Enter');
        expect(chosen).toMatchObject({ write: 'c', chosen: true, submit: false, query: 'c' });
    });
    it('navigates only matching suggestions when reopening an autocomplete', () => {
        const typed = reduceSelect(ready({ editable: true, value: 'Gamma' }), {
            kind: 'query',
            text: 'Gamma',
        });
        const closed = key(typed, 'Escape');
        expect(key(closed, 'ArrowUp')).toMatchObject({ open: true, active: 0, query: 'Gamma' });
        expect(key(key(closed, 'ArrowUp'), 'Enter')).toMatchObject({ write: 'c', chosen: true });
    });
    it('keeps a typing popup open when the owning value echoes back, and clears on reset', () => {
        const typed = reduceSelect(ready({ editable: true, value: '' }), {
            kind: 'query',
            text: 'Gamma',
        });
        const echoed = reduceSelect(typed, {
            kind: 'config',
            config: { ...config, editable: true, value: 'Gamma' },
        });
        expect(echoed).toMatchObject({ open: true, query: 'Gamma' });
        expect(
            reduceSelect(echoed, {
                kind: 'config',
                config: { ...config, editable: true, value: '' },
            }),
        ).toMatchObject({ open: false, query: '' });
    });
});

describe('popup placement', () => {
    it('stays inside the viewport horizontally', () => {
        expect(
            popupPlacement(
                { left: 490, top: 30, bottom: 50, width: 100 },
                { width: 550, height: 800 },
            ),
        ).toMatchObject({ left: 352, width: 190, top: 54, bottom: null });
        expect(
            popupPlacement(
                { left: -100, top: 30, bottom: 50, width: 500 },
                { width: 320, height: 800 },
            ),
        ).toMatchObject({ left: 8, width: 304 });
    });
    it('opens above a control near the bottom', () => {
        expect(
            popupPlacement(
                { left: 20, top: 700, bottom: 730, width: 200 },
                { width: 550, height: 800 },
            ),
        ).toMatchObject({ top: null, bottom: 104, height: 300 });
    });
});

describe('upward launcher popovers', () => {
    it('prefers the space above the launcher, while still clamping to the viewport', () => {
        const rect = { left: 580, top: 220, bottom: 248, width: 28 };
        const viewport = { width: 640, height: 800 };
        expect(popupPlacement(rect, viewport).top).toBe(252);
        expect(popupPlacement(rect, viewport, true)).toEqual({
            left: 442,
            top: null,
            bottom: 584,
            width: 190,
            height: 208,
        });
        expect(popupPlacement({ ...rect, top: 20, bottom: 48 }, viewport, true).top).toBe(52);
    });
});
