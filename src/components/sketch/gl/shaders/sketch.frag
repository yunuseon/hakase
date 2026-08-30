#version 300 es
precision highp float;

uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

in float vDepth;
in float vPointSize;

out vec4 fragColor;

void main() {
    float dist = length(gl_PointCoord - 0.5) * 2.0;
    float aa = 2.0 / max(vPointSize, 1.0);
    float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, dist);

    if (alpha <= 0.0) {
        discard;
    }

    vec3 color = vDepth < 0.33 ? uColor1 : (vDepth < 0.66 ? uColor2 : uColor3);

    fragColor = vec4(color * alpha, alpha);
}
