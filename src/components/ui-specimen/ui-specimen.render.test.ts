import { afterEach, describe, expect, it } from 'vitest';
import { merge } from 'rxjs';
import { scan, startWith, tap } from 'rxjs/operators';
import { HksUiSpecimen } from './ui-specimen.component.ts';
import { initialSpecimen, reduceSpecimen } from './ui-specimen.ts';
import { requireElement } from '../../lib/dom.ts';

afterEach(() => document.body.replaceChildren());
describe('shared control specimen', () => {
    it('feeds the same choice back through native and button-based radios', () => {
        const element = new HksUiSpecimen();
        document.body.append(element);
        const root = element.shadowRoot ?? element;
        const initial = { ...initialSpecimen, kind: 'choices' };
        const changes: string[] = [];
        const running = merge(
            element.connect$(
                element.changes$.pipe(scan(reduceSpecimen, initial), startWith(initial)),
            ),
            element.changes$.pipe(tap(change => changes.push(change.kind))),
        ).subscribe();
        requireElement(root, 'button[data-choice="two"]', HTMLButtonElement).click();
        expect(requireElement(root, 'input[value="two"]', HTMLInputElement).checked).toBe(true);
        const native = requireElement(root, 'input[value="three"]', HTMLInputElement);
        native.checked = true;
        native.dispatchEvent(new Event('change', { bubbles: true }));
        expect(
            requireElement(root, 'button[data-choice="three"]', HTMLButtonElement).getAttribute(
                'aria-checked',
            ),
        ).toBe('true');
        expect(changes).toEqual(['choice', 'choice']);
        running.unsubscribe();
        expect(root.childElementCount).toBe(0);
    });
});
