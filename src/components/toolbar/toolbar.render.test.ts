import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { merge } from 'rxjs';
import { tap } from 'rxjs/operators';
import { HksToolbar } from './toolbar.component.ts';
import { requireChild, requireElement } from '../../lib/dom.ts';

const originalShow = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'showPopover');
const originalHide = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover');
// Happy DOM has no top layer; actual popover layout is verified in the browser.
beforeEach(() => {
    const opened = new WeakSet<HTMLElement>();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
        configurable: true,
        value: function (this: HTMLElement) {
            opened.add(this);
        },
    });
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
        configurable: true,
        value: function (this: HTMLElement) {
            opened.delete(this);
        },
    });
    vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
        this: HTMLElement,
        selector: string,
    ) {
        return selector === ':popover-open'
            ? opened.has(this)
            : Element.prototype.matches.call(this, selector);
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    if (originalShow === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
    } else {
        Object.defineProperty(HTMLElement.prototype, 'showPopover', originalShow);
    }
    if (originalHide === undefined) {
        Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover');
    } else {
        Object.defineProperty(HTMLElement.prototype, 'hidePopover', originalHide);
    }
});
const categories = [
    {
        id: 'make',
        title: 'Make',
        icon: 'M4 4h16v16H4z',
        items: [
            { id: 'formula', title: 'Formula', icon: 'M4 4h16v16H4z' },
            { id: 'paint', title: 'Paint', icon: 'M4 4h16v16H4z' },
        ],
    },
    {
        id: 'plan',
        title: 'Plan',
        icon: 'M4 4h16v16H4z',
        items: [{ id: 'tickets', title: 'Tickets', icon: 'M4 4h16v16H4z' }],
    },
];
afterEach(() => document.body.replaceChildren());
const key = (element: HTMLElement, value: string) =>
    element.dispatchEvent(
        new KeyboardEvent('keydown', {
            key: value,
            bubbles: true,
            composed: true,
            cancelable: true,
        }),
    );
describe('integrated program launcher', () => {
    it('navigates menus with the keyboard and emits one launch before closing', () => {
        const element = new HksToolbar().categories(categories);
        document.body.append(element);
        const root = element.shadowRoot ?? element;
        const launches: string[] = [];
        const running = merge(
            element.connect$(),
            element.launches$.pipe(tap(id => launches.push(id))),
        ).subscribe();
        const make = requireChild(root, 'summary[aria-label="Make"]');
        key(make, 'ArrowDown');
        expect(element.shadowRoot?.activeElement).toBe(
            root.querySelector('[data-program="formula"]'),
        );
        expect(
            [...root.querySelectorAll('.places')].filter(panel => panel.matches(':popover-open')),
        ).toHaveLength(1);
        key(requireChild(root, '[data-program="formula"]'), 'End');
        expect(element.shadowRoot?.activeElement).toBe(
            root.querySelector('[data-program="paint"]'),
        );
        key(requireChild(root, '[data-program="paint"]'), 'Escape');
        expect(element.shadowRoot?.activeElement).toBe(make);
        expect(root.querySelectorAll('details[open]')).toHaveLength(0);
        key(make, 'ArrowUp');
        expect(element.shadowRoot?.activeElement).toBe(
            root.querySelector('[data-program="paint"]'),
        );
        requireElement(root, '[data-program="paint"]', HTMLButtonElement).click();
        expect(launches).toEqual(['paint']);
        expect(
            [...root.querySelectorAll('.places')].filter(panel => panel.matches(':popover-open')),
        ).toHaveLength(0);
        running.unsubscribe();
        expect(root.childElementCount).toBe(0);
        key(make, 'ArrowDown');
        expect(launches).toEqual(['paint']);
    });
    it('keeps only one menu open and dismisses on outside pointerdown', () => {
        const element = new HksToolbar().categories(categories);
        document.body.append(element);
        const root = element.shadowRoot ?? element;
        const running = element.connect$().subscribe();
        key(requireChild(root, 'summary[aria-label="Make"]'), 'ArrowDown');
        key(requireChild(root, 'summary[aria-label="Plan"]'), 'ArrowDown');
        expect(root.querySelectorAll('details[open]')).toHaveLength(1);
        expect(root.querySelector('details[open] summary')?.getAttribute('aria-label')).toBe(
            'Plan',
        );
        document.body.dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, composed: true }),
        );
        expect(root.querySelectorAll('details[open]')).toHaveLength(0);
        expect(
            [...root.querySelectorAll('.places')].filter(panel => panel.matches(':popover-open')),
        ).toHaveLength(0);
        running.unsubscribe();
    });
});
