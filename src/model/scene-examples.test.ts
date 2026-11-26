import { describe, expect, it } from 'vitest';
import { defaultScene, definesCustom, parseScene, reduceScene } from './scene.ts';
import { SCENE_EXAMPLE_NAMES, SCENE_EXAMPLES } from './scene-examples.ts';

describe('example scenes', () => {
    it('load over a scene and keep what its knobs follow', () => {
        const linked = reduceScene(defaultScene, { kind: 'source', param: 'k1', source: 'sine' });
        const loaded = reduceScene(linked, { kind: 'load', scene: SCENE_EXAMPLES.blobs.scene });

        expect(loaded.code).toBe(SCENE_EXAMPLES.blobs.scene.code);
        expect(loaded.objects).toBe(SCENE_EXAMPLES.blobs.scene.objects);
        expect(loaded.sources.k1).toBe('sine');
    });

    it.each(SCENE_EXAMPLE_NAMES)('%s survives a save, every value inside its range', name => {
        const { scene } = SCENE_EXAMPLES[name];
        const saved = parseScene(
            JSON.parse(JSON.stringify({ ...scene, sources: defaultScene.sources })),
        );

        expect(saved).toEqual({ ...scene, sources: defaultScene.sources });
    });

    it('give every code object a custom() to call', () => {
        SCENE_EXAMPLE_NAMES.forEach(name => {
            const { scene } = SCENE_EXAMPLES[name];

            expect(
                !scene.objects.some(({ shape }) => shape === 'code') || definesCustom(scene.code),
            ).toBe(true);
        });
    });
});
