import { afterEach, describe, expect, it } from 'vitest';
import { of, throwError } from 'rxjs';
import { HksStorybook } from '../components/storybook/storybook.component.ts';
import { HksSelect } from '../shared/select/select.component.ts';
import { requireChild, requireElement } from '../lib/dom.ts';
import { appearances } from '../appearances.ts';
import { connectBook$ } from './connect.ts';
import { programStories } from './program-stories.ts';
import { controlStories } from './control-stories.ts';
import type { Story } from './story.ts';

const appearance = {
    look$: of('paper' as const),
    appearance$: () => of({ value: appearances.paper, from: null }),
};
afterEach(() => document.body.replaceChildren());
describe('storybook integration', () => {
    it('keeps the preview on argument edits, logs events, and disposes on switch or reset', () => {
        const book = new HksStorybook();
        document.body.append(book);
        const running = connectBook$(book, appearance, controlStories).subscribe();
        const root = book.shadowRoot ?? book;
        const select = requireElement(root, '.sample hks-select', HksSelect);
        const label = requireElement(root, '.label-control', HTMLInputElement);
        label.value = 'A different label';
        label.dispatchEvent(new Event('input', { bubbles: true }));
        expect(root.querySelector('.sample hks-select')).toBe(select);
        expect(select.getAttribute('aria-label')).toBe('A different label');
        select.value = 'ink';
        select.dispatchEvent(new Event('change'));
        expect(requireChild(root, '.events').textContent).toContain('ink');
        requireChild(root, '[data-action="clear"]').click();
        expect(requireChild(root, '.events').textContent).not.toContain('ink');
        requireChild(root, '[data-story="picker"]').click();
        expect(root.querySelector('.sample hks-select')).toBe(null);
        expect(select.shadowRoot?.querySelector('.trigger')).toBe(null);
        const picker = root.querySelector('.sample hks-search-picker');
        requireChild(root, '[data-action="reset"]').click();
        expect(root.querySelector('.sample hks-search-picker')).not.toBe(picker);
        expect(picker?.shadowRoot?.childElementCount).toBe(0);
        running.unsubscribe();
        expect(root.querySelector('.frame')).toBe(null);
    });
    it('resets a running program fixture after a document edit', () => {
        const story = programStories.find(story => story.id === 'tickets');
        if (story === undefined) {
            throw new Error('Tickets fixture missing');
        }
        const book = new HksStorybook();
        document.body.append(book);
        const running = connectBook$(book, appearance, [story]).subscribe();
        const root = book.shadowRoot ?? book;
        const ticketRoot = () => requireChild(root, '.sample hks-tickets').shadowRoot ?? root;
        requireElement(ticketRoot(), '[data-toggle="ticket-4"]', HTMLInputElement).dispatchEvent(
            new Event('change', { bubbles: true }),
        );
        expect(
            requireElement(ticketRoot(), '[data-toggle="ticket-4"]', HTMLInputElement).checked,
        ).toBe(true);
        requireChild(root, '[data-action="reset"]').click();
        expect(
            requireElement(ticketRoot(), '[data-toggle="ticket-4"]', HTMLInputElement).checked,
        ).toBe(false);
        expect(requireChild(root, '.events').textContent).not.toContain('toggle');
        running.unsubscribe();
    });

    it('shows a failed fixture without preventing another story from opening', () => {
        const good = controlStories.find(story => story.id === 'select');
        if (good === undefined) {
            throw new Error('Select fixture missing');
        }
        const broken: Story = {
            ...good,
            id: 'broken',
            title: 'Broken',
            create: context => ({
                ...good.create(context),
                run$: throwError(() => new Error('Unavailable renderer')),
            }),
        };
        const book = new HksStorybook();
        document.body.append(book);
        const running = connectBook$(book, appearance, [broken, good]).subscribe();
        const root = book.shadowRoot ?? book;
        expect(root.querySelector('.sample hks-preview-error')?.shadowRoot?.textContent).toContain(
            'Unavailable renderer',
        );
        requireChild(root, '[data-story="select"]').click();
        expect(root.querySelector('.sample hks-select')).not.toBe(null);
        running.unsubscribe();
    });
});
