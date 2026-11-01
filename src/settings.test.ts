import { describe, expect, it } from 'vitest';
import { DEFAULT_ORBIT } from './components/sketch/space.ts';
import { controlsView, defaultSketch, withControl } from './settings.ts';

describe('withControl', () => {
    const turned = { ...defaultSketch, orbit: { ...DEFAULT_ORBIT, yaw: 1.2 } };

    it('resets the view along with the rest of the camera', () => {
        expect(withControl(turned, { field: 'reset', group: 'camera' }).orbit).toEqual(
            DEFAULT_ORBIT,
        );
    });

    it('leaves the view alone when another group is reset', () => {
        expect(withControl(turned, { field: 'reset', group: 'drawing' }).orbit).toEqual(
            turned.orbit,
        );
    });
});

describe('controlsView', () => {
    it('counts a turned camera as something to reset', () => {
        expect(controlsView(defaultSketch).changed.camera).toBe(false);
        expect(
            controlsView({ ...defaultSketch, orbit: { ...DEFAULT_ORBIT, yaw: 1 } }).changed.camera,
        ).toBe(true);
    });
});
