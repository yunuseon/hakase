#version 300 es
precision highp float;

uniform vec3 uColour;

in vec2 vLocal;
in float vInner;
in float vReach;
in float vFlow;

out vec4 colour;

void main() {
    float weight = vFlow * (1.0 - smoothstep(vInner, vReach, length(vLocal)));

    if (weight <= 0.0) {
        discard;
    }

    colour = vec4(uColour * weight, weight);
}
