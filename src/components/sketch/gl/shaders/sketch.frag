#version 300 es
precision highp float;
// The vertex stage is highp by default, and a uniform both stages read must agree or the link fails.
precision highp int;

#define MODE_DOTS 0
#define MODE_SURFACE 2
#define PASS_AXES 1
#define PASS_FADE 2
#define PASS_STEP 3
#define PASS_SEED 4

const float SMALL_DOT = 6.0;

uniform sampler2D uPalette;
uniform int uMode;
uniform int uPass;
uniform float uFade;
// Target pixels per on-screen pixel of the live sketch: 1 there, other for a thumbnail, so edges match it.
uniform float uDotScale;

in vec4 vColor;
in float vTint;
in float vPointSize;
in vec3 vPosition;
flat in vec4 vState;

out vec4 fragColor;

const vec3 LIGHT = normalize(vec3(-0.4, 0.5, 0.75));

float coverage() {
    if (uMode != MODE_DOTS) {
        return 1.0;
    }

    float dist = length(gl_PointCoord - 0.5) * 2.0;
    float aa = 2.0 * uDotScale / max(vPointSize, uDotScale);

    return 1.0 - smoothstep(1.0 - aa, 1.0, dist);
}

float shading() {
    if (uMode != MODE_SURFACE) {
        return 1.0;
    }

    vec3 face = cross(dFdx(vPosition), dFdy(vPosition));

    // A collapsed triangle has no normal, and normalize(0) is NaN on most drivers.
    if (dot(face, face) < 1e-20) {
        return 1.0;
    }

    vec3 normal = normalize(face);

    return 0.35 + 0.65 * abs(dot(normal, LIGHT));
}

void main() {
    if (uPass == PASS_STEP || uPass == PASS_SEED) {
        fragColor = vState;

        return;
    }

    if (uPass == PASS_FADE) {
        // The ramp's first entry is the backdrop, so trails fade into the canvas colour.
        fragColor = vec4(texture(uPalette, vec2(0.0, 0.5)).rgb * uFade, uFade);

        return;
    }

    if (uPass == PASS_AXES) {
        fragColor = vec4(vColor.rgb * vColor.a, vColor.a);

        return;
    }

    float alpha = coverage();

    // Half, not zero: a faint edge that wrote depth would cut a fringe. A dot too small to show a fringe
    // keeps its whole soft edge instead, or a few-pixel dot loses half of itself and all but vanishes.
    if (alpha < (vPointSize < SMALL_DOT * uDotScale ? 0.02 : 0.5)) {
        discard;
    }

    vec3 color = texture(uPalette, vec2(clamp(vTint, 0.0, 1.0), 0.5)).rgb * shading();

    fragColor = vec4(color * alpha, alpha);
}
