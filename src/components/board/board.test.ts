import { describe, expect, it } from 'vitest';
import {
    defaultBoard,
    dropTarget,
    parseBoard,
    reduceBoard,
    stepped,
    UNTITLED,
    type Board,
    type BoardCommand,
} from './board.ts';

const run = (...commands: BoardCommand[]): Board => commands.reduce(reduceBoard, defaultBoard);

const texts = (board: Board): string[][] =>
    board.columns.map(({ cards }) => cards.map(({ text }) => text));

const filled = run(
    { kind: 'add-card', column: 'column-1', text: 'a' },
    { kind: 'add-card', column: 'column-1', text: 'b' },
    { kind: 'add-card', column: 'column-1', text: 'c' },
    { kind: 'add-card', column: 'column-2', text: 'd' },
);

describe('reduceBoard', () => {
    it('adds trimmed cards and ignores empty drafts', () => {
        const board = run(
            { kind: 'add-card', column: 'column-2', text: '  x  ' },
            { kind: 'add-card', column: 'column-2', text: '   ' },
            { kind: 'add-card', column: 'nowhere', text: 'y' },
        );

        expect(texts(board)).toEqual([[], ['x'], []]);
    });

    it('never reuses an id, across cards and columns', () => {
        const commands: BoardCommand[] = [
            { kind: 'remove-card', id: 'card-7' },
            { kind: 'add-column' },
            { kind: 'add-card', column: 'column-1', text: 'e' },
        ];
        const board = commands.reduce(reduceBoard, filled);
        const ids = board.columns.flatMap(({ id, cards }) => [id, ...cards.map(card => card.id)]);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it('moves within a column, counting places without the moved card', () => {
        const board = reduceBoard(filled, {
            kind: 'move-card',
            id: 'card-4',
            column: 'column-1',
            to: 2,
        });

        expect(texts(board)[0]).toEqual(['b', 'c', 'a']);
    });

    it('moves across columns', () => {
        const board = reduceBoard(filled, {
            kind: 'move-card',
            id: 'card-6',
            column: 'column-2',
            to: 0,
        });

        expect(texts(board)).toEqual([['a', 'b'], ['c', 'd'], []]);
    });

    it('keeps the old text when an edit is emptied', () => {
        const board = reduceBoard(filled, { kind: 'edit-card', id: 'card-4', text: '  ' });

        expect(texts(board)[0]?.[0]).toBe('a');
    });

    it('removes only an empty column', () => {
        const kept = reduceBoard(filled, { kind: 'remove-column', id: 'column-1' });
        const removed = reduceBoard(filled, { kind: 'remove-column', id: 'column-3' });

        expect(kept.columns).toHaveLength(3);
        expect(removed.columns.map(({ id }) => id)).toEqual(['column-1', 'column-2']);
    });

    it('names a column untitled rather than nothing', () => {
        const board = reduceBoard(filled, { kind: 'rename-column', id: 'column-3', title: ' ' });

        expect(board.columns[2]?.title).toBe(UNTITLED);
    });

    it('reorders columns', () => {
        const board = reduceBoard(filled, { kind: 'move-column', id: 'column-3', to: 0 });

        expect(board.columns.map(({ id }) => id)).toEqual(['column-3', 'column-1', 'column-2']);
    });
});

describe('dropTarget', () => {
    const lanes = [
        { id: 'one', left: 0, right: 100, middles: [10, 30] },
        { id: 'two', left: 110, right: 210, middles: [] },
    ];

    it('picks the lane under the pointer and counts the cards above it', () => {
        expect(dropTarget(50, 20, lanes)).toEqual({ column: 'one', to: 1 });
        expect(dropTarget(150, 99, lanes)).toEqual({ column: 'two', to: 0 });
    });

    it('falls back to the nearest lane outside them all', () => {
        expect(dropTarget(400, 40, lanes)).toEqual({ column: 'two', to: 0 });
        expect(dropTarget(-50, 40, lanes)).toEqual({ column: 'one', to: 2 });
    });

    it('has no target without lanes', () => {
        expect(dropTarget(0, 0, [])).toBeNull();
    });
});

describe('stepped', () => {
    it('moves up and down, and stops at the ends', () => {
        expect(stepped(filled, 'card-5', 'up')).toEqual({
            kind: 'move-card',
            id: 'card-5',
            column: 'column-1',
            to: 0,
        });
        expect(stepped(filled, 'card-4', 'up')).toBeNull();
        expect(stepped(filled, 'card-6', 'down')).toBeNull();
    });

    it('moves sideways at the same height, clamped to the neighbour', () => {
        expect(stepped(filled, 'card-6', 'right')).toEqual({
            kind: 'move-card',
            id: 'card-6',
            column: 'column-2',
            to: 1,
        });
        expect(stepped(filled, 'card-4', 'left')).toBeNull();
    });
});

describe('step-card', () => {
    it('applies a step and ignores one off the board', () => {
        const right = reduceBoard(filled, { kind: 'step-card', id: 'card-4', step: 'right' });

        expect(texts(right)).toEqual([['b', 'c'], ['a', 'd'], []]);
        expect(reduceBoard(filled, { kind: 'step-card', id: 'card-4', step: 'left' })).toBe(filled);
    });
});

describe('parseBoard', () => {
    it('falls back to the default board', () => {
        expect(parseBoard(null)).toBe(defaultBoard);
        expect(parseBoard({ columns: 'x', made: 1 })).toBe(defaultBoard);
    });

    it('keeps the counter above every id it finds', () => {
        const board = parseBoard({
            columns: [{ id: 'column-1', title: 'a', cards: [{ id: 'card-12', text: 'x' }, 7] }],
            made: 2,
        });

        expect(board.made).toBe(12);
        expect(board.columns[0]?.cards).toHaveLength(1);
    });
});
