import { afterEach, describe, expect, it, vi } from 'vitest';
import { merge } from 'rxjs';
import { tap } from 'rxjs/operators';
import { programDemo } from './program-demo.ts';
import { ticketsProgram } from '../programs/tickets.program.ts';
import { requireElement } from '../lib/dom.ts';

afterEach(() => document.body.replaceChildren());
describe('isolated program previews', () => {
    it('folds ticket events once, updates the real component, and tears it down', async () => {
        const demo = programDemo(ticketsProgram, { kind: 'tickets', view: 'list' });
        document.body.append(demo.element);
        const events: string[] = [];
        const running = merge(
            demo.run$,
            demo.events$.pipe(tap(event => events.push(event.name))),
        ).subscribe();
        const root = await vi.waitFor(() => {
            const shadow = demo.element.firstElementChild?.shadowRoot;
            expect(shadow?.querySelector('[data-toggle="ticket-4"]')).toBeInstanceOf(
                HTMLInputElement,
            );
            return shadow ?? demo.element;
        });
        const checkbox = requireElement(root, '[data-toggle="ticket-4"]', HTMLInputElement);
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        expect(events).toEqual(['ticket']);
        expect(requireElement(root, '[data-toggle="ticket-4"]', HTMLInputElement).checked).toBe(
            true,
        );
        running.unsubscribe();
        expect(root.querySelector('.frame')).toBe(null);
        const fresh = programDemo(ticketsProgram, { kind: 'tickets', view: 'list' });
        const next = merge(fresh.run$, fresh.events$).subscribe();
        const again = await vi.waitFor(() => {
            const shadow = fresh.element.firstElementChild?.shadowRoot;
            expect(shadow?.querySelector('[data-toggle="ticket-4"]')).toBeInstanceOf(
                HTMLInputElement,
            );
            return shadow ?? fresh.element;
        });
        expect(requireElement(again, '[data-toggle="ticket-4"]', HTMLInputElement).checked).toBe(
            false,
        );
        next.unsubscribe();
    });
});
