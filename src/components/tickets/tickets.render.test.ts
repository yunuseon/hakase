import { afterEach, describe, expect, it } from 'vitest';
import { fromEvent, merge, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { HksTickets } from './tickets.component.ts';
import { HksSelect } from '../../shared/select/select.component.ts';
import { requireChild, requireElement } from '../../lib/dom.ts';
import { defaultTickets, reduceTickets, ticketView, type Tickets } from '../../shared/tickets.ts';

const documentWithTickets = (): Tickets =>
    reduceTickets(
        reduceTickets(
            defaultTickets,
            { kind: 'add', title: 'First', status: null, parent: null },
            { seq: 1 },
        ),
        { kind: 'add', title: 'Second', status: null, parent: null },
        { seq: 2 },
    );

afterEach(() => document.body.replaceChildren());

describe('lit-html ticket rendering', () => {
    it('keeps the existing row and focused draft when another ticket changes', () => {
        const element = new HksTickets();
        document.body.append(element);
        const root = element.shadowRoot ?? element;
        const tickets = documentWithTickets();
        const edits = new EventTarget();
        const screens$ = merge(
            of(ticketView(tickets, null)),
            fromEvent(edits, 'update').pipe(
                map(() =>
                    ticketView(
                        reduceTickets(
                            tickets,
                            { kind: 'rename', id: 'ticket-2', title: 'Updated' },
                            { seq: 3 },
                        ),
                        null,
                    ),
                ),
            ),
        );
        const running = element.connect$(screens$, of('list')).subscribe();
        const row = root.querySelector('[data-ticket="ticket-1"]');
        const input = requireElement(root, '[data-edit="ticket-1"]', HTMLTextAreaElement);
        input.focus();
        input.value = 'Uncommitted';
        edits.dispatchEvent(new Event('update'));
        expect(root.querySelector('[data-ticket="ticket-1"]')).toBe(row);
        expect(input.value).toBe('Uncommitted');
        expect(requireElement(root, '[data-edit="ticket-2"]', HTMLTextAreaElement).value).toBe(
            'Updated',
        );
        running.unsubscribe();
        expect(root.querySelector('.frame')).toBe(null);
    });

    it('keeps custom-control routing attributes and emits one command from a checkbox', () => {
        const element = new HksTickets();
        document.body.append(element);
        const root = element.shadowRoot ?? element;
        const commands: string[] = [];
        const running = merge(
            element.connect$(of(ticketView(documentWithTickets(), null)), of('board')),
            element.commands$.pipe(map(command => commands.push(command.kind))),
        ).subscribe();
        const stage = requireElement(root, 'hks-select[data-stage="status-1"]', HksSelect);
        expect(stage.value).toBe('open');
        requireElement(root, '[data-toggle="ticket-1"]', HTMLInputElement).dispatchEvent(
            new Event('change', { bubbles: true }),
        );
        expect(commands).toEqual(['toggle']);
        expect(element.dataset['view']).toBe('board');
        running.unsubscribe();
    });

    it('opens the selected ticket details without replacing the list', () => {
        const element = new HksTickets();
        document.body.append(element);
        const root = element.shadowRoot ?? element;
        const running = element
            .connect$(of(ticketView(documentWithTickets(), null)), of('list'))
            .subscribe();
        const row = root.querySelector('[data-ticket="ticket-1"]');
        requireChild(root, '[data-open="ticket-1"]').click();
        expect(requireChild(root, '.detail').hidden).toBe(false);
        expect(requireElement(root, '.detail-title', HTMLInputElement).value).toBe('First');
        expect(root.querySelector('[data-ticket="ticket-1"]')).toBe(row);
        expect(requireElement(root, '.tag-draft', HksSelect).hasAttribute('editable')).toBe(true);
        running.unsubscribe();
    });
});
