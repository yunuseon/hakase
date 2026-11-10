#version 300 es
precision highp float;

uniform sampler2D uIn0;
uniform sampler2D uPalette;
// amount, offset
uniform float uKnobs[8];

in vec2 vUv;
out vec4 colour;

void main() {
    vec3 picture = texture(uIn0, vUv).rgb;
    float light = dot(picture, vec3(0.2126, 0.7152, 0.0722));
    vec3 mapped = texture(uPalette, vec2(fract(light + uKnobs[1]), 0.5)).rgb;
    colour = vec4(mix(picture, mapped, uKnobs[0]), 1.0);
}
