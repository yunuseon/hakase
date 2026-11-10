#version 300 es
precision highp float;

uniform sampler2D uIn0;
uniform sampler2D uPrevious;
uniform vec2 uResolution;
// decay, zoom, rotate, x, y
uniform float uKnobs[8];

in vec2 vUv;
out vec4 colour;

const float TAU = 6.28318530718;

void main() {
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float turn = -uKnobs[2] * TAU;
    p = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * p / max(uKnobs[1], 0.0001);
    vec2 back = p / vec2(aspect, 1.0) + 0.5 - vec2(uKnobs[3], uKnobs[4]);
    vec3 previous = texture(uPrevious, back).rgb;
    vec3 picture = texture(uIn0, vUv).rgb;
    colour = vec4(mix(picture, previous, uKnobs[0]), 1.0);
}
