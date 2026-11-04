import { describe, expect, it } from 'vitest';
import { paintInputsOf, workingFrame } from './painting.ts';
import { defaultPaint } from './settings.ts';
import { blank, type Picture } from './shared/picture.ts';

const picture: Picture = { side: 16, frames: [blank(16), blank(16)], fade: false };
const at = { x: 0.5, y: 0.5 };

describe('paintInputsOf', () => {
    it('paints a stroke with the window’s own brush, symmetry and frame', () => {
        const settings = { ...defaultPaint, symmetry: 'quad' as const, frame: 1, size: 7 };

        expect(
            paintInputsOf({ kind: 'stroke', from: at, to: at, start: true }, settings, picture),
        ).toEqual([
            {
                kind: 'paint',
                command: {
                    kind: 'stroke',
                    frame: 1,
                    from: at,
                    to: at,
                    brush: { tool: 'brush', size: 7, hardness: 0.4, flow: 0.6 },
                    symmetry: 'quad',
                    start: true,
                },
            },
        ]);
    });

    it('fills on the press alone, and not again as the pointer moves', () => {
        const fill = { ...defaultPaint, tool: 'fill' as const };

        expect(
            paintInputsOf({ kind: 'stroke', from: at, to: at, start: true }, fill, picture),
        ).toHaveLength(1);
        expect(
            paintInputsOf({ kind: 'stroke', from: at, to: at, start: false }, fill, picture),
        ).toEqual([]);
    });

    it('turns to a new frame, steps round the ends, and never deletes the last one', () => {
        expect(paintInputsOf({ kind: 'add-frame' }, defaultPaint, picture)).toEqual([
            { kind: 'paint', command: { kind: 'add-frame', after: 0, copy: true } },
            { kind: 'settings', settings: { ...defaultPaint, frame: 1 } },
        ]);
        expect(paintInputsOf({ kind: 'step-frame', by: -1 }, defaultPaint, picture)).toEqual([
            { kind: 'settings', settings: { ...defaultPaint, frame: 1 } },
        ]);
        expect(
            paintInputsOf({ kind: 'remove-frame' }, defaultPaint, {
                ...picture,
                frames: [blank(16)],
            }),
        ).toEqual([]);
    });

    it('keeps the working frame inside a stack that shrank elsewhere, and the brush in range', () => {
        expect(workingFrame({ ...defaultPaint, frame: 9 }, picture)).toBe(1);
        expect(paintInputsOf({ kind: 'grow', by: 99 }, defaultPaint, picture)).toEqual([
            { kind: 'settings', settings: { ...defaultPaint, size: 24 } },
        ]);
    });
});
