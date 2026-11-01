import { describe, expect, it } from 'vitest';
import { defaultPanel } from '../params.ts';
import { GROUPS, groupChanged, resetGroup, withChange } from './controls.ts';

const tweaked = {
    ...defaultPanel,
    dimension: 99,
    focus: 0.75,
    space: 'polar' as const,
    trails: 0.5,
    lens: 'orthographic' as const,
    knobs: { ...defaultPanel.knobs, k1: 0.9 },
    motion: { ...defaultPanel.motion, k1: 4 as const },
};

describe('group resets', () => {
    it('reset only their own fields', () => {
        const sampled = resetGroup(tweaked, 'sampling');

        expect(sampled).toMatchObject({
            dimension: defaultPanel.dimension,
            focus: defaultPanel.focus,
        });
        expect(sampled).toMatchObject({ space: 'polar', trails: 0.5, lens: 'orthographic' });
        expect(sampled.knobs.k1).toBe(0.9);
    });

    it('reset the knobs and their motion together', () => {
        const reset = resetGroup(tweaked, 'parameters');

        expect(reset.knobs).toEqual(defaultPanel.knobs);
        expect(reset.motion).toEqual(defaultPanel.motion);
        expect(reset.dimension).toBe(99);
    });

    it('leave nothing changed once every group is reset', () => {
        const all = GROUPS.reduce(resetGroup, tweaked);

        expect(GROUPS.filter(group => groupChanged(all, group))).toEqual([]);
    });

    it('are reported as changed only where a reset would do something', () => {
        expect(GROUPS.filter(group => groupChanged(tweaked, group))).toEqual([
            'parameters',
            'sampling',
            'space',
            'drawing',
            'camera',
        ]);
        expect(GROUPS.filter(group => groupChanged(defaultPanel, group))).toEqual([]);
    });

    it('arrive as an ordinary change', () => {
        expect(withChange(tweaked, { field: 'reset', group: 'space' }).space).toBe(
            defaultPanel.space,
        );
    });
});
