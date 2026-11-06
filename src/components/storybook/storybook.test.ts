import { describe, expect, it } from 'vitest';
import {
    bookView,
    emptyLog,
    initialBook,
    reduceBook,
    reduceEventLog,
    type StoryInfo,
} from './storybook.ts';

const stories: readonly StoryInfo[] = [
    {
        id: 'select',
        title: 'Custom select',
        group: 'Controls',
        description: 'Searchable choices',
        elements: ['hks-select'],
        variants: [
            { id: 'normal', title: 'Normal' },
            { id: 'empty', title: 'Empty' },
        ],
        controls: ['disabled'],
        defaults: { label: 'Choose', value: 30, disabled: false },
        height: 200,
        code: '',
        action: null,
    },
    {
        id: 'tickets',
        title: 'Tickets',
        group: 'Planning',
        description: 'A board and list',
        elements: ['hks-tickets'],
        variants: [{ id: 'list', title: 'List' }],
        controls: [],
        defaults: { label: 'Ticket', value: 0, disabled: false },
        height: 400,
        code: '',
        action: null,
    },
];
describe('storybook state', () => {
    it('searches across title, group and custom-element name with all terms required', () => {
        const initial = initialBook(stories);
        expect(
            bookView({ ...initial, query: ' CONTROLS hks-select ' }, stories).matches.map(
                story => story.id,
            ),
        ).toEqual(['select']);
        expect(bookView({ ...initial, query: 'tickets searchable' }, stories).matches).toEqual([]);
        expect(bookView({ ...initial, query: 'board' }, stories).groups).toEqual(['Planning']);
        expect(bookView({ ...initial, query: 'board' }, stories).story?.id).toBe('select');
    });
    it('keeps theme and width while resetting fixture state when switching stories', () => {
        const before = {
            ...initialBook(stories),
            appearance: 'night',
            width: '240',
            args: { label: 'Draft', value: 99, disabled: true },
        };
        const after = reduceBook(before, { kind: 'select', value: 'tickets' }, stories);
        expect(after).toMatchObject({
            selected: 'tickets',
            variant: 'list',
            appearance: 'night',
            width: '240',
            args: stories[1]?.defaults,
            revision: 1,
        });
        expect(reduceBook(after, { kind: 'select', value: 'unknown' }, stories)).toBe(after);
    });
    it('remounts only for explicit resets and valid variants, not argument changes', () => {
        const initial = initialBook(stories);
        expect(reduceBook(initial, { kind: 'disabled', value: true }, stories).revision).toBe(0);
        expect(reduceBook(initial, { kind: 'variant', value: 'empty' }, stories).revision).toBe(1);
        expect(reduceBook(initial, { kind: 'variant', value: 'invalid' }, stories)).toBe(initial);
        expect(reduceBook(initial, { kind: 'reset' }, stories).revision).toBe(1);
        expect(reduceBook(initial, { kind: 'value', value: Infinity }, stories)).toBe(initial);
        expect(reduceBook(initial, { kind: 'value', value: 150 }, stories).args.value).toBe(100);
    });
    it('bounds event history and discards it for a new fixture', () => {
        const log = Array.from({ length: 20 }, (_, index) => index).reduce(
            (state, index) =>
                reduceEventLog(state, {
                    kind: 'event',
                    event: { name: 'pick', detail: String(index) },
                }),
            emptyLog,
        );
        expect(log.entries).toHaveLength(12);
        expect(log.entries[0]).toEqual({ seq: 20, name: 'pick', detail: '19' });
        expect(reduceEventLog(log, { kind: 'reset' })).toEqual(emptyLog);
    });
});
