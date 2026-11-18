import { afterEach, describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { requireElement } from '../../lib/dom.ts';
import type { PropertyChange, Section } from '../properties.ts';
import { HksProperties } from './properties.component.ts';

afterEach(() => document.body.replaceChildren());

const sections: readonly Section[] = [
    {
        id: 'main',
        title: null,
        fold: false,
        properties: [
            {
                kind: 'choice',
                id: 'reading',
                label: 'reads',
                value: 'a',
                options: [
                    { value: 'a', label: 'A' },
                    { value: 'b', label: 'B' },
                ],
            },
        ],
    },
    {
        id: 'shape',
        title: 'Shape',
        fold: true,
        properties: [
            { kind: 'toggle', id: 'shape.invert', label: 'invert', value: false },
            {
                kind: 'range',
                id: 'shape.curve',
                label: 'curve',
                value: 0,
                min: -1,
                max: 1,
                step: 0.05,
                text: 'linear',
            },
            { kind: 'number', id: 'bits.threshold', label: 'threshold', value: 0.5, step: 0.1 },
        ],
    },
];

describe('hks-properties', () => {
    it('renders the rows it is given and reports what was done to them, by id', () => {
        const element = new HksProperties();
        document.body.append(element);
        const changes: PropertyChange[] = [];
        const running = element.connect$(of(sections)).subscribe();
        const listening = element.changes$.subscribe(change => changes.push(change));
        const root = element.shadowRoot;

        if (root === null) {
            throw new Error('no shadow root');
        }

        requireElement(root, '[data-value="b"]', HTMLButtonElement).click();
        const invert = requireElement(root, '[data-id="shape.invert"]', HTMLInputElement);
        invert.checked = true;
        invert.dispatchEvent(new Event('change', { bubbles: true }));
        const curve = requireElement(root, '[data-id="shape.curve"]', HTMLInputElement);
        curve.value = '0.5';
        curve.dispatchEvent(new Event('input', { bubbles: true }));
        curve.dispatchEvent(new Event('change', { bubbles: true }));
        const threshold = requireElement(root, '[data-id="bits.threshold"]', HTMLInputElement);
        expect(threshold.value).toBe('0.5');
        threshold.value = '0.7';
        threshold.dispatchEvent(new Event('change', { bubbles: true }));

        expect(changes).toEqual([
            { id: 'reading', value: 'b' },
            { id: 'shape.invert', value: true },
            { id: 'shape.curve', value: 0.5 },
            { id: 'bits.threshold', value: 0.7 },
        ]);

        const shape = requireElement(root, 'section[aria-label="Shape"]', HTMLElement);
        expect(shape.hasAttribute('data-open')).toBe(false);
        requireElement(root, '[data-section="shape"]', HTMLButtonElement).click();
        expect(shape.hasAttribute('data-open')).toBe(true);

        running.unsubscribe();
        listening.unsubscribe();
        expect(root.querySelector('.row')).toBeNull();
    });
});
