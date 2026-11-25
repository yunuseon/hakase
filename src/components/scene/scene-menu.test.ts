import { describe, expect, it } from 'vitest';
import { SCENE_EXAMPLES } from '../../model/scene-examples.ts';
import { exampleOf, sceneMenu } from './scene-menu.ts';

describe('the scene menu', () => {
    it('offers every example, and reads each pick back as its scene', () => {
        const items = sceneMenu('M0 0').flatMap(({ items }) => items);

        expect(items.map(({ label }) => label)).toEqual([
            'Start from Still life',
            'Start from Blobs',
            'Start from Room',
            'Start from Interior',
            'Start from Lens',
            'Start from Field',
        ]);
        expect(items.map(({ id }) => exampleOf(id))).toEqual(
            Object.values(SCENE_EXAMPLES).map(({ scene }) => scene),
        );
        expect(exampleOf('example.constructor')).toBeNull();
        expect(exampleOf('delete')).toBeNull();
    });
});
