import { describe, expect, it } from 'vitest';
import { captureStores, commandsOf, pickedOf, steppedSection } from './commands.ts';
import { inputsFor } from './inputs.fixture.ts';
import { defaultWorkspace, type Section, type Workspace } from './workspace.ts';

const section = (id: string, x: number, y: number): Section => ({
    id,
    name: id,
    rect: { x, y, width: 100, height: 100 },
});

const viewport = { width: 200, height: 200 };

const at = (x: number, y: number) => ({ x: 100 - x, y: 100 - y, zoom: 1 });

describe('steppedSection', () => {
    // Created out of reading order, and not a rotation of it either, so array order cannot pass for it.
    const sections = [section('a', 0, 0), section('c', 400, 400), section('b', 400, 0)];

    it('steps in reading order, top to bottom then left to right', () => {
        expect(steppedSection(sections, at(50, 50), viewport, 'next')).toBe('b');
        expect(steppedSection(sections, at(450, 50), viewport, 'next')).toBe('c');
        expect(steppedSection(sections, at(450, 450), viewport, 'next')).toBe('a');
        expect(steppedSection(sections, at(50, 50), viewport, 'previous')).toBe('c');
    });

    it('goes to the nearest section first when the view is between them', () => {
        expect(steppedSection(sections, at(470, 330), viewport, 'next')).toBe('c');
    });

    it('has nowhere to go without sections', () => {
        expect(steppedSection([], at(0, 0), viewport, 'next')).toBeNull();
    });
});

const entry = (id: string, program: 'tickets' | 'note', name: string) => ({
    id,
    program,
    name,
    kept: true,
    copy: null,
    clock: null,
});

const lists = (frontmost: string | null): Workspace => {
    const base = defaultWorkspace({ width: 1400, height: 900 }, inputsFor);
    const frame = { x: 0, y: 0, z: 0, width: 280, height: 320 };

    return {
        ...base,
        stores: [
            ...base.stores,
            entry('store-1', 'tickets', 'Groceries'),
            entry('store-2', 'tickets', 'Errands'),
            entry('store-3', 'note', 'Sprint'),
        ],
        processes:
            frontmost === null
                ? base.processes
                : [
                      ...base.processes,
                      {
                          id: 'todo-9',
                          program: 'tickets',
                          store: frontmost,
                          follows: {},
                          frame,
                          measured: { width: 280, height: 320 },
                      },
                  ],
    };
};

describe('captures', () => {
    it('offer every state, Main always, then by name', () => {
        expect(captureStores('tickets', lists(null)).map(({ name }) => name)).toEqual([
            'Main',
            'Errands',
            'Groceries',
        ]);
        expect(captureStores('note', lists(null)).map(({ id }) => id)).toEqual(['note', 'store-3']);
    });

    it('put the frontmost window’s state first', () => {
        expect(captureStores('tickets', lists('store-1')).map(({ name }) => name)).toEqual([
            'Groceries',
            'Main',
            'Errands',
        ]);
    });

    it('are commands named after their state, all claiming the same word', () => {
        expect(
            commandsOf([], lists('store-1')).filter(({ keyword }) => keyword === 'ticket'),
        ).toEqual([
            {
                id: 'capture:ticket:store-1',
                label: 'Add ticket to Groceries',
                hint: 'ticket …',
                keyword: 'ticket',
            },
            {
                id: 'capture:ticket:tickets',
                label: 'Add ticket to Main',
                hint: 'ticket …',
                keyword: 'ticket',
            },
            {
                id: 'capture:ticket:store-2',
                label: 'Add ticket to Errands',
                hint: 'ticket …',
                keyword: 'ticket',
            },
        ]);
    });

    it('carry their state and text, trimmed, and nothing without either', () => {
        expect(pickedOf('capture:todo:store-1', '  buy milk ')).toEqual({
            kind: 'capture',
            target: 'todo',
            store: 'store-1',
            text: 'buy milk',
        });
        expect(pickedOf('capture:todo:store-1', '  ')).toBeNull();
        expect(pickedOf('capture:todo:store-1', null)).toBeNull();
        expect(pickedOf('capture:todo', 'milk')).toBeNull();
        expect(pickedOf('capture:agenda:agenda', 'standup')).toBeNull();
        expect(pickedOf('launch:tickets', 'ignored')).toEqual({
            kind: 'launch',
            program: 'tickets',
        });
    });
});
