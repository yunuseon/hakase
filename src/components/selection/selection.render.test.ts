import { afterEach, expect, it } from 'vitest';
import { merge, of } from 'rxjs';
import { HksSelection } from './selection.component.ts';
import { requireElement } from '../../lib/dom.ts';
import type { SelectionCommand } from './selection.ts';
afterEach(() => document.body.replaceChildren());
it('exposes selection actions and removes their listeners and toolbar on teardown', () => {
    const element = new HksSelection();
    document.body.append(element);
    const commands: SelectionCommand[] = [];
    const running = merge(
        element.connect$(of({ count: 1, copied: false, boxable: false })),
        element.changes$,
    ).subscribe(value => {
        if (value !== undefined) commands.push(value);
    });
    const root = element.shadowRoot ?? element;
    const copy = requireElement(root, '[data-command="copy"]', HTMLButtonElement);
    const paste = requireElement(root, '[data-command="paste"]', HTMLButtonElement);
    const save = requireElement(root, '[data-command="save"]', HTMLButtonElement);
    const remove = requireElement(root, '[data-command="delete"]', HTMLButtonElement);
    expect(copy.disabled).toBe(false);
    expect(remove.disabled).toBe(false);
    expect(paste.disabled).toBe(true);
    copy.click();
    save.click();
    remove.click();
    expect(commands).toEqual(['copy', 'save', 'delete']);
    running.unsubscribe();
    copy.click();
    expect(commands).toHaveLength(3);
    expect(root.querySelector('.actions')).toBe(null);
});
