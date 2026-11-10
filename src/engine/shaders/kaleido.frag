#version 300 es
precision highp float;

uniform sampler2D uIn0;
uniform vec2 uResolution;
// segments, rotate, x, y
uniform float uKnobs[8];
// 0 mirror, 1 turn
uniform int uChoice;

in vec2 vUv;
out vec4 colour;

const float TAU = 6.28318530718;

void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 centre = vec2(uKnobs[2], uKnobs[3]) * 0.5 + 0.5;
    vec2 p = (vUv - centre) * vec2(aspect, 1.0);
    float slice = TAU / max(uKnobs[0], 1.0);
    float angle = mod(atan(p.y, p.x) + uKnobs[1] * TAU, slice);

    if (uChoice == 0) {
        angle = abs(angle - 0.5 * slice);
    }

    vec2 folded = length(p) * vec2(cos(angle), sin(angle));
    vec2 uv = centre + folded / vec2(aspect, 1.0);
    // Mirrored at the edges, so a fold that reaches past the picture finds picture rather than a clamp smear.
    uv = 1.0 - abs(1.0 - mod(uv, 2.0));
    colour = vec4(texture(uIn0, uv).rgb, 1.0);
}
