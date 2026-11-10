#version 300 es
precision highp float;

uniform sampler2D uIn0;
uniform sampler2D uIn1;
// amount
uniform float uKnobs[8];
// The order of MIX_MODES: over, add, screen, multiply, difference.
uniform int uChoice;

in vec2 vUv;
out vec4 colour;

void main() {
    vec3 a = texture(uIn0, vUv).rgb;
    vec3 b = texture(uIn1, vUv).rgb;
    float amount = uKnobs[0];
    vec3 blended =
        uChoice == 0 ? b :
        uChoice == 1 ? min(a + b, 1.0) :
        uChoice == 2 ? 1.0 - (1.0 - a) * (1.0 - b) :
        uChoice == 3 ? a * b :
        abs(a - b);
    colour = vec4(mix(a, blended, amount), 1.0);
}
