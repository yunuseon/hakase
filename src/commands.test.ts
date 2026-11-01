import { describe, expect, it } from 'vitest';
import { steppedSection } from './commands.ts';
import type { Section } from './workspace.ts';

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
