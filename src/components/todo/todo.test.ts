import { describe, expect, it } from 'vitest';
import { dropIndex, emptyTodos, reduceTodos, type TodoList } from './todo.ts';

const listOf = (...texts: string[]): TodoList =>
    texts.reduce((list, text) => reduceTodos(list, { kind: 'add', text }), emptyTodos);

const texts = (list: TodoList): string[] => list.items.map(({ text }) => text);

describe('reduceTodos', () => {
    it('trims and ignores empty drafts', () => {
        expect(texts(listOf('  a  ', '   ', 'b'))).toEqual(['a', 'b']);
    });

    it('never reuses the id of a removed item', () => {
        const list = listOf('a', 'b');
        const removed = reduceTodos(list, { kind: 'remove', id: 'todo-2' });
        const added = reduceTodos(removed, { kind: 'add', text: 'c' });

        expect(added.items.map(({ id }) => id)).toEqual(['todo-1', 'todo-3']);
    });

    it('moves to a position counted without the moved item', () => {
        const list = listOf('a', 'b', 'c', 'd');

        expect(texts(reduceTodos(list, { kind: 'move', id: 'todo-1', to: 2 }))).toEqual([
            'b',
            'c',
            'a',
            'd',
        ]);
        expect(texts(reduceTodos(list, { kind: 'move', id: 'todo-4', to: 0 }))).toEqual([
            'd',
            'a',
            'b',
            'c',
        ]);
        expect(texts(reduceTodos(list, { kind: 'move', id: 'todo-2', to: 99 }))).toEqual([
            'a',
            'c',
            'd',
            'b',
        ]);
    });

    it('clears only what is done', () => {
        const toggled = reduceTodos(listOf('a', 'b'), { kind: 'toggle', id: 'todo-1' });

        expect(texts(reduceTodos(toggled, { kind: 'clear-done' }))).toEqual(['b']);
    });
});

describe('dropIndex', () => {
    it('counts the rows whose middle is above the pointer', () => {
        expect(dropIndex(5, [10, 30, 50])).toBe(0);
        expect(dropIndex(35, [10, 30, 50])).toBe(2);
        expect(dropIndex(99, [10, 30, 50])).toBe(3);
    });
});
