import { describe, expect, it } from 'vitest';
import {
    closedCreation,
    creationCommand,
    creatorView,
    reduceCreation,
    type CreationChange,
} from './ticket-creator.ts';
import { defaultTickets, reduceTickets, ticketsIn } from '../../shared/tickets.ts';

const open: CreationChange = { kind: 'open', title: '', status: null, parent: null, tags: [] };
const run = (...changes: readonly CreationChange[]) =>
    changes.reduce(reduceCreation, closedCreation);

describe('ticket creation', () => {
    it('validates the title, preserves drafts between steps, and submits once', () => {
        const empty = run(open, { kind: 'advance' });
        expect(empty.phase).toBe('editing');
        expect(empty.step).toBe(0);
        expect(empty.error).not.toBe('');
        const reviewing = run(
            open,
            { kind: 'title', value: 'Ship' },
            { kind: 'description', value: 'The requirements' },
            { kind: 'priority', value: 'high' },
            { kind: 'advance' },
            { kind: 'tag', value: 'Work' },
            { kind: 'advance' },
        );
        expect(reviewing.step).toBe(2);
        expect(reduceCreation(reviewing, { kind: 'back' }).draft).toBe(reviewing.draft);
        const submitted = reduceCreation(reviewing, { kind: 'advance' });
        expect(submitted.phase).toBe('submitted');
        expect(reduceCreation(submitted, { kind: 'advance' })).toBe(submitted);
        expect(
            ticketsIn(reduceTickets(defaultTickets, creationCommand(submitted)))[0],
        ).toMatchObject({
            title: 'Ship',
            description: 'The requirements',
            priority: 'high',
            tags: ['work'],
        });
    });
    it('cancels without creating anything and starts each opening with a fresh draft', () => {
        const typed = run(open, { kind: 'title', value: 'Discard me' }, { kind: 'advance' });
        expect(reduceCreation(typed, { kind: 'cancel' })).toBe(closedCreation);
        expect(reduceCreation(typed, open).draft.title).toBe('');
        expect(reduceCreation(closedCreation, { kind: 'title', value: 'Ignored' })).toBe(
            closedCreation,
        );
    });
    it('preselects context and toggles tags, parent and blockers', () => {
        const state = run(
            {
                ...open,
                kind: 'open',
                title: 'Child',
                status: 'status-2',
                parent: 'a',
                tags: ['Work'],
            },
            { kind: 'tag', value: 'work' },
            { kind: 'parent', value: 'a' },
            { kind: 'blocker', value: 'b' },
            { kind: 'blocker', value: 'b' },
        );
        expect(state.draft).toMatchObject({
            title: 'Child',
            status: 'status-2',
            parent: null,
            tags: [],
            blockedBy: [],
        });
    });
    it('resolves review labels and handles a status or linked ticket removed elsewhere', () => {
        const state = run({
            ...open,
            kind: 'open',
            title: 'Work',
            status: 'gone',
            parent: 'gone',
            tags: [],
        });
        const view = creatorView(state, defaultTickets);
        expect(view.status).toBe('status-1');
        expect(view.summary.find(row => row.label === 'Parent')?.value).toBe('None');
    });
});
