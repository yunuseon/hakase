#version 300 es
precision highp float;

uniform sampler2D uIn0;
uniform vec2 uResolution;
// radius
uniform float uKnobs[8];
// One axis per pass: (1, 0) then (0, 1).
uniform vec2 uDirection;

in vec2 vUv;
out vec4 colour;

const int TAPS = 12;

void main() {
    float radius = uKnobs[0] * 0.04 * max(uResolution.x, uResolution.y);
    vec2 step = uDirection / uResolution * radius / float(TAPS);
    vec3 sum = vec3(0.0);
    float weights = 0.0;

    for (int i = -TAPS; i <= TAPS; i++) {
        float x = float(i) / float(TAPS);
        float weight = exp(-4.0 * x * x);
        sum += texture(uIn0, vUv + step * float(i)).rgb * weight;
        weights += weight;
    }

    colour = vec4(sum / weights, 1.0);
}
