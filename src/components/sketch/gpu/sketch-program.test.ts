import { describe, expect, it } from 'vitest';
import {
    adapterFor,
    declaresWrap,
    DEFAULT_STEPS,
    evolves,
    knobLabelsOf,
    readableMessages,
    stepsOf,
    writtenInGlsl,
} from './sketch-program.ts';

describe('a formula in WGSL', () => {
    it('names its knobs in comment lines of their own', () => {
        expect(
            knobLabelsOf(
                '// k1: feed\n// k3: camera height\nfn formula() {}\nlet x = 1; // k2: not this',
            ),
        ).toEqual({ k1: 'feed', k2: 'k2', k3: 'camera height', k4: 'k4' });
    });

    it('reads its steps and its seam from ordinary constants', () => {
        expect(stepsOf('const STEPS = 480;')).toBe(480);
        expect(stepsOf('const STEPS: i32 = 5000;')).toBe(1000);
        expect(stepsOf('fn formula() {}')).toBe(DEFAULT_STEPS);
        expect(declaresWrap('const WRAPS = true;')).toBe(true);
        expect(declaresWrap('const WRAPS: bool = true;')).toBe(true);
        expect(declaresWrap('const WRAPS = false;')).toBe(false);
    });

    it('uses its own hooks only when it defines them', () => {
        const plain = adapterFor(
            'fn formula(x: f32, y: f32, t: f32) -> vec3f { return vec3f(x, y, 0.0); }',
        );
        const tinted = adapterFor(
            [
                'fn formula(x: f32, y: f32, t: f32) -> vec4f { return vec4f(0.0); }',
                'fn camera(t: f32) -> Camera { return Camera(vec3f(1.0), vec3f(0.0), vec3f(0.0, 1.0, 0.0)); }',
                'fn space(p: vec3f) -> vec3f { return p; }',
                'fn evolve(x: f32, y: f32, t: f32) -> vec4f { return state(); }',
            ].join('\n'),
        );

        expect(plain).toContain('let v = formula(x, y, t); return vec4f(v, v.z);');
        expect(plain).toContain('return builtinLattice(uv);');
        expect(plain).toContain('fn ownSpace() -> bool { return false; }');
        expect(tinted).toContain(
            'fn point(x: f32, y: f32, t: f32) -> vec4f { return formula(x, y, t); }',
        );
        expect(tinted).toContain('return camera(t);');
        expect(tinted).toContain('fn ownSpace() -> bool { return true; }');
        expect(tinted).toContain('return evolve(x, y, t);');
        expect(evolves('fn evolve(x: f32, y: f32, t: f32) -> vec4f {}')).toBe(true);
    });

    it('reports errors at the formula’s own lines', () => {
        expect(
            readableMessages(
                [
                    { type: 'warning', lineNum: 410, linePos: 1, message: 'unused' },
                    {
                        type: 'error',
                        lineNum: 402,
                        linePos: 16,
                        message: "unresolved value 'nope'",
                    },
                    { type: 'error', lineNum: 3, linePos: 1, message: 'in the prelude' },
                ],
                400,
            ),
        ).toBe("ERROR line 2:16: unresolved value 'nope'\nERROR: in the prelude");
    });

    it('knows a formula saved in GLSL, so it is kept and named rather than failed', () => {
        expect(writtenInGlsl('vec3 formula(float x, float y, float t) { return vec3(x); }')).toBe(
            true,
        );
        expect(writtenInGlsl('#define K1 feed\nfn formula() {}')).toBe(true);
        expect(writtenInGlsl('Hit custom(vec3 p, float t) { }')).toBe(true);
        expect(
            writtenInGlsl('fn formula(x: f32, y: f32, t: f32) -> vec3f { return vec3f(x); }'),
        ).toBe(false);
        expect(writtenInGlsl('// a float formula(x) in a comment\nfn formula() {}')).toBe(false);
    });
});
