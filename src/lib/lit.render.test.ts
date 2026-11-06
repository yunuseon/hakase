import { afterEach, describe, expect, it } from 'vitest';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ref } from 'lit-html/directives/ref.js';
import { displayValue, renderView } from './lit.ts';
import { requireElement } from './dom.ts';

const host = (): ShadowRoot => {
    const element = document.createElement('div');
    document.body.append(element);
    return element.attachShadow({ mode: 'open' });
};

afterEach(() => document.body.replaceChildren());

describe('lit-html rendering lifetime', () => {
    it('applies views directly and stops updating after process teardown', () => {
        const root = host();
        const view = renderView(
            root,
            { title: 'First', disabled: false },
            state => html`<button ?disabled=${state.disabled}>${state.title}</button>`,
        );
        const lifetime = view.lifetime$.subscribe();
        const button = requireElement(root, 'button', HTMLButtonElement);
        view.update({ title: 'Second', disabled: true });
        expect(button.textContent).toBe('Second');
        expect(button.disabled).toBe(true);
        lifetime.unsubscribe();
        expect(root.querySelector('button')).toBe(null);
        view.update({ title: 'After disposal', disabled: false });
        expect(root.querySelector('button')).toBe(null);
        expect(button.textContent).toBe('Second');
    });

    it('preserves keyed nodes when their order changes', () => {
        const root = host();
        const view = renderView<readonly string[]>(root, ['a', 'b'], items =>
            repeat(
                items,
                id => id,
                id => html`<input data-id=${id} />`,
            ),
        );
        const lifetime = view.lifetime$.subscribe();
        const first = requireElement(root, '[data-id="a"]', HTMLInputElement);
        first.value = 'uncommitted';
        view.update(['b', 'a']);
        expect(root.querySelector('[data-id="a"]')).toBe(first);
        expect(first.value).toBe('uncommitted');
        expect(root.querySelectorAll('input')[1]).toBe(first);
        lifetime.unsubscribe();
    });

    it('disconnects removed item directives and the root on process teardown', () => {
        const cleaned: string[] = [];
        const callbacks = new Map(
            ['a', 'b'].map(id => [
                id,
                (element: Element | undefined): void => {
                    if (element === undefined) {
                        cleaned.push(id);
                    }
                },
            ]),
        );
        const root = host();
        const view = renderView<readonly string[]>(root, ['a', 'b'], items =>
            repeat(
                items,
                id => id,
                id => html`<span ${ref(callbacks.get(id))}>${id}</span>`,
            ),
        );
        const lifetime = view.lifetime$.subscribe();
        view.update(['b']);
        expect(cleaned).toEqual(['a']);
        lifetime.unsubscribe();
        expect(cleaned).toEqual(['a', 'b']);
    });

    it('isolates two mounted instances', () => {
        const a = host();
        const b = host();
        const first = renderView(a, 'one', value => html`<span>${value}</span>`);
        const second = renderView(b, 'two', value => html`<span>${value}</span>`);
        const left = first.lifetime$.subscribe();
        const right = second.lifetime$.subscribe();
        first.update('changed');
        expect(a.textContent).toBe('changed');
        expect(b.textContent).toBe('two');
        left.unsubscribe();
        second.update('still live');
        expect(b.textContent).toBe('still live');
        right.unsubscribe();
    });

    it('keeps a focused edit until committed while applying other changes', () => {
        const root = host();
        const view = renderView(
            root,
            { name: 'Saved', label: 'First' },
            state =>
                html`<input
                        ${ref(element => {
                            if (element instanceof HTMLInputElement) {
                                displayValue(element, state.name);
                            }
                        })}
                    /><span>${state.label}</span>`,
        );
        const lifetime = view.lifetime$.subscribe();
        const input = requireElement(root, 'input', HTMLInputElement);
        input.focus();
        input.value = 'Draft';
        view.update({ name: 'Remote', label: 'Updated' });
        expect(input.value).toBe('Draft');
        expect(root.querySelector('span')?.textContent).toBe('Updated');
        input.blur();
        view.update({ name: 'Committed', label: 'Updated' });
        expect(input.value).toBe('Committed');
        lifetime.unsubscribe();
    });
});
