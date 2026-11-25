import { describe, expect, it } from 'vitest';
import {
    defaultScene,
    definesCustom,
    MAX_OBJECTS,
    objectUniforms,
    OBJECT_VEC4S,
    parseScene,
    reduceScene,
    objectsCode,
    sceneAdapter,
    type Scene,
} from './scene.ts';

describe('a scene', () => {
    it('names an added object from the log, not from how many there are', () => {
        const added = reduceScene(defaultScene, { kind: 'add', shape: 'box' }, { seq: 41 });
        const removed = reduceScene(added, { kind: 'remove', id: 'ball' });
        const again = reduceScene(removed, { kind: 'add', shape: 'box' }, { seq: 42 });

        expect(again.objects.map(({ id }) => id)).toEqual([
            'floor',
            'ring',
            'lamp',
            'object-41',
            'object-42',
        ]);
    });

    it('holds at most MAX_OBJECTS objects', () => {
        const full = Array.from({ length: MAX_OBJECTS + 3 }, (_, seq) => seq).reduce(
            (scene: Scene, seq) => reduceScene(scene, { kind: 'add', shape: 'sphere' }, { seq }),
            defaultScene,
        );

        expect(full.objects).toHaveLength(MAX_OBJECTS);
    });

    it('clamps a field to its range and keeps the same scene for no change', () => {
        const moved = reduceScene(defaultScene, {
            kind: 'object',
            id: 'ball',
            field: 'x',
            value: 99,
        });

        expect(moved.objects.find(({ id }) => id === 'ball')?.x).toBe(4);
        expect(reduceScene(moved, { kind: 'object', id: 'ball', field: 'x', value: 4 })).toBe(
            moved,
        );
        expect(
            reduceScene(defaultScene, { kind: 'set', field: 'bounces', value: 2.6 }).bounces,
        ).toBe(3);
    });

    it('lets a knob follow a source, and reads it back from storage', () => {
        const linked = reduceScene(defaultScene, { kind: 'source', param: 'k1', source: 'sine' });
        const parsed = parseScene(JSON.parse(JSON.stringify(linked)));

        expect(parsed.sources.k1).toBe('sine');
        expect(parsed.objects).toEqual(defaultScene.objects);
        expect(parsed.theme).toBe(defaultScene.theme);
    });

    it('drops what it cannot read, field by field', () => {
        const parsed = parseScene({
            objects: [
                { id: 'a', shape: 'sphere', material: 'velvet', x: 'far' },
                { id: 'a', shape: 'box' },
                { id: 'b', shape: 'teapot' },
                null,
            ],
            theme: 'nowhere',
            bounces: 1000,
            constructor: 3,
        });

        expect(parsed.objects).toHaveLength(1);
        expect(parsed.objects[0]?.material).toBe('matte');
        expect(parsed.objects[0]?.x).toBe(0);
        expect(parsed.theme).toBe(defaultScene.theme);
        expect(parsed.bounces).toBe(8);
    });

    it('packs three vec4s per object for the shader', () => {
        const packed = objectUniforms(defaultScene.objects);
        const ring = defaultScene.objects[2];

        expect(packed).toHaveLength(defaultScene.objects.length * OBJECT_VEC4S * 4);
        expect([...packed.slice(24, 28)]).toEqual(
            Array.from(
                Float32Array.from([ring?.x ?? 0, ring?.y ?? 0, ring?.z ?? 0, ring?.size ?? 0]),
            ),
        );
        expect(packed[28]).toBe(2);
        expect(packed[29]).toBe(2);
    });

    it('uses the code’s own hooks only when it defines them', () => {
        const code = 'Hit custom(vec3 p, float t) { return hit(p.y, MATTE, 0.5, 1.0); }';

        expect(definesCustom(code)).toBe(true);
        expect(sceneAdapter(code)).toContain('return custom(p, t);');
        expect(sceneAdapter('')).not.toContain('custom(p, t)');
        expect(sceneAdapter('Camera camera(float t) { }')).toContain('return camera(t);');
        expect(sceneAdapter('vec4 bounds(float t) { }')).toContain('return bounds(t);');
        expect(sceneAdapter('')).toContain('return vec4(0.0);');
    });

    it('writes each object out with its own shape, so the shader never branches on one', () => {
        const code = objectsCode(['sphere', 'plane', 'code']);

        expect(code).toContain('sdSphere(p - uObjects[0].xyz, uObjects[0].w)');
        expect(code).toContain('p.y - uObjects[3].y');
        expect(code).toContain(
            'codeAt(turned(p - uObjects[6].xyz, uObjects[8].x), uObjects[6].w, t)',
        );
        expect(code).toContain('nearest = 2;');
        expect(code).not.toContain('shape ==');
        expect(sceneAdapter('', ['box'])).toContain('sdBox(turned(p - uObjects[0].xyz');
        expect(sceneAdapter('')).toContain('Hit objectsAt(vec3 p, float t) {');
    });
});
