import { describe, expect, it } from 'vitest';
import { IDENTITY, panned, worldAt, zoomedAround, type Camera, type Point } from './camera.ts';
import { NO_TOUCHES, reduceTouches, type TouchInput, type Touches } from './pinch.ts';

const run = (inputs: readonly TouchInput[]): readonly Touches[] =>
    inputs.reduce<readonly Touches[]>(
        (states, input) => [...states, reduceTouches(states.at(-1) ?? NO_TOUCHES, input)],
        [],
    );

const applied = (camera: Camera, states: readonly Touches[]): Camera =>
    states
        .flatMap(state => state.gestures)
        .reduce(
            (current, gesture) =>
                gesture.kind === 'pan'
                    ? panned(current, gesture.dx, gesture.dy)
                    : zoomedAround(current, gesture.factor, gesture.at),
            camera,
        );

const down = (id: number, x: number, y: number, pans = true): TouchInput => ({
    kind: 'down',
    id,
    at: { x, y },
    pans,
});
const move = (id: number, x: number, y: number): TouchInput => ({ kind: 'move', id, at: { x, y } });

const near = (a: Point, b: Point) => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
};

describe('reduceTouches', () => {
    it('pans with one finger that started on the ground', () => {
        const states = run([down(1, 10, 10), move(1, 25, 4)]);

        expect(states.at(-1)?.gestures).toEqual([{ kind: 'pan', dx: 15, dy: -6 }]);
    });

    it('does not pan with one finger that started elsewhere', () => {
        const states = run([down(1, 10, 10, false), move(1, 25, 4)]);

        expect(states.at(-1)?.gestures).toEqual([]);
    });

    it('ignores a finger it never saw go down', () => {
        expect(run([move(7, 1, 1)]).at(-1)?.gestures).toEqual([]);
    });

    it('keeps what was under each finger under it while they spread', () => {
        const start = { x: 40, y: 30, zoom: 1.5 };
        const under = [worldAt(start, { x: 100, y: 100 }), worldAt(start, { x: 200, y: 100 })];
        const camera = applied(
            start,
            run([down(1, 100, 100), down(2, 200, 100), move(1, 50, 100), move(2, 250, 100)]),
        );

        near(worldAt(camera, { x: 50, y: 100 }), under[0] ?? IDENTITY);
        near(worldAt(camera, { x: 250, y: 100 }), under[1] ?? IDENTITY);
    });

    it('keeps the midpoint under the fingers while they move and turn', () => {
        const start = { x: 0, y: 0, zoom: 1 };
        const middle = worldAt(start, { x: 150, y: 100 });
        const camera = applied(
            start,
            run([down(1, 100, 100), down(2, 200, 100), move(1, 130, 60), move(2, 260, 180)]),
        );

        near(worldAt(camera, { x: 195, y: 120 }), middle);
    });

    it('pinches even when neither finger started on the ground', () => {
        const states = run([down(1, 0, 0, false), down(2, 100, 0, false), move(2, 200, 0)]);

        expect(states.at(-1)?.gestures.map(gesture => gesture.kind)).toEqual(['pan', 'zoom']);
    });

    it('ignores a third finger until one of the first two lifts', () => {
        const states = run([
            down(1, 0, 0),
            down(2, 100, 0),
            down(3, 50, 50),
            move(3, 80, 80),
            { kind: 'up', id: 2 },
            move(1, 5, 0),
        ]);

        expect(states[3]?.gestures).toEqual([]);
        expect(states.at(-1)?.gestures.map(gesture => gesture.kind)).toEqual(['pan', 'zoom']);
    });

    it('lets the remaining finger pan after the other lifts', () => {
        const states = run([down(1, 0, 0), down(2, 100, 0), { kind: 'up', id: 2 }, move(1, 5, 3)]);

        expect(states.at(-1)?.gestures).toEqual([{ kind: 'pan', dx: 5, dy: 3 }]);
    });
});
