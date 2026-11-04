import { describe, expect, it } from 'vitest';
import {
    entriesOf,
    logged,
    redone,
    startTimeline,
    takenBack,
    travelled,
    undone,
    type Kit,
    type Timeline,
} from './timeline.ts';

type Item = { readonly id: string; readonly text: string };
type State = { readonly items: readonly Item[]; readonly view: number };
type Action =
    | { readonly kind: 'add'; readonly text: string }
    | { readonly kind: 'rename'; readonly id: string; readonly text: string }
    | { readonly kind: 'type'; readonly id: string; readonly letter: string }
    | { readonly kind: 'look'; readonly view: number }
    | { readonly kind: 'pause' };

const kit: Kit<State, Action> = {
    settled: action => action,
    reduce: (state, action, seq) => {
        switch (action.kind) {
            case 'add':
                return {
                    ...state,
                    items: [...state.items, { id: `item-${seq}`, text: action.text }],
                };
            case 'rename':
            case 'type':
                return state.items.some(({ id }) => id === action.id)
                    ? {
                          ...state,
                          items: state.items.map(item =>
                              item.id !== action.id
                                  ? item
                                  : {
                                        ...item,
                                        text:
                                            action.kind === 'rename'
                                                ? action.text
                                                : item.text + action.letter,
                                    },
                          ),
                      }
                    : state;
            case 'look':
                return { ...state, view: action.view };
            case 'pause':
                return state;
        }
    },
    stepOf: action =>
        action.kind === 'look' || action.kind === 'pause'
            ? { key: null, breaks: action.kind === 'pause' }
            : {
                  key: `${action.kind}:${'id' in action ? action.id : ''}`,
                  joins: action.kind === 'type',
              },
    labelOf: action => action.kind,
    kept: (restored, current) => ({ ...restored, view: current.view }),
};

const log = logged(kit);
const run = (
    actions: readonly Action[],
    from = startTimeline<State, Action>({ items: [], view: 0 }, 0),
) => actions.reduce(log, from);
const texts = ({ present }: Timeline<State, Action>) => present.items.map(({ text }) => text);

describe('the log', () => {
    it('folds a gesture into one step, undone and redone in one go', () => {
        const typed = run([
            { kind: 'add', text: '' },
            { kind: 'type', id: 'item-1', letter: 'h' },
            { kind: 'type', id: 'item-1', letter: 'i' },
        ]);

        expect(texts(typed)).toEqual(['hi']);
        expect(typed.steps).toHaveLength(2);
        expect(texts(undone(kit)(typed))).toEqual(['']);
        expect(texts(redone(kit)(undone(kit)(typed)))).toEqual(['hi']);
    });

    it('lets a break end a gesture, and keeps the view where it is through undo', () => {
        const twice = run([
            { kind: 'add', text: '' },
            { kind: 'type', id: 'item-1', letter: 'a' },
            { kind: 'pause' },
            { kind: 'type', id: 'item-1', letter: 'b' },
            { kind: 'look', view: 7 },
        ]);

        expect(twice.steps).toHaveLength(3);
        expect(undone(kit)(twice).present).toEqual({
            items: [{ id: 'item-1', text: 'a' }],
            view: 7,
        });
    });

    it('takes back an old step and keeps every later one, ids and all', () => {
        const built = run([
            { kind: 'add', text: 'first' },
            { kind: 'add', text: 'second' },
            { kind: 'rename', id: 'item-2', text: 'renamed' },
        ]);
        const first = built.steps[0]?.id ?? -1;
        const back = takenBack(kit)(built, first);

        expect(back.present.items).toEqual([{ id: 'item-2', text: 'renamed' }]);
        expect(entriesOf(back).find(entry => entry.id === first)?.taken).toBe(true);
        expect(entriesOf(back).at(-1)).toMatchObject({ takesBack: true, offset: 0 });
        expect(texts(undone(kit)(back))).toEqual(['first', 'renamed']);
        expect(takenBack(kit)(back, first)).toBe(back);
        expect(takenBack(kit)(back, back.steps.at(-1)?.id ?? -1)).toBe(back);
    });

    it('takes back two steps on top of each other, and a new step drops the redo', () => {
        const built = run([
            { kind: 'add', text: 'a' },
            { kind: 'add', text: 'b' },
            { kind: 'add', text: 'c' },
        ]);
        const once = takenBack(kit)(built, built.steps[1]?.id ?? -1);
        const twice = takenBack(kit)(once, built.steps[0]?.id ?? -1);

        expect(texts(twice)).toEqual(['c']);
        expect(texts(travelled(kit)(twice, -2))).toEqual(['a', 'b', 'c']);
        expect(run([{ kind: 'add', text: 'd' }], undone(kit)(twice)).steps).toHaveLength(5);
    });

    it('keeps a refused action out of the log', () => {
        const built = run([{ kind: 'rename', id: 'missing', text: 'x' }]);

        expect(built.steps).toHaveLength(0);
        expect(built.seq).toBe(0);
    });

    it('keeps at most a hundred steps, never splitting a step from its take-back', () => {
        const many = run(
            Array.from({ length: 105 }, (_, index) => ({ kind: 'add' as const, text: `${index}` })),
        );

        expect(many.steps).toHaveLength(100);
        expect(texts(travelled(kit)(many, -100))).toHaveLength(5);

        const early = run(
            Array.from({ length: 99 }, (_, index) => ({ kind: 'add' as const, text: `${index}` })),
        );
        const back = takenBack(kit)(early, early.steps[0]?.id ?? -1);
        const grown = run([{ kind: 'add', text: 'more' }], back);

        expect(grown.steps).toHaveLength(1);
        expect(texts(grown)).toHaveLength(99);
        expect(texts(grown)[0]).toBe('1');
    });
});
