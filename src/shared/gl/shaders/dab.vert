#version 300 es

layout(location = 0) in vec4 aDab;

uniform float uTexel;
uniform float uHardness;
// 1 into a texture, whose first row is the picture's top; -1 onto a screen, whose first row is its bottom.
uniform float uFlip;

out vec2 vLocal;
out float vInner;
out float vReach;
out float vFlow;

const vec2 CORNERS[4] = vec2[4](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));

void main() {
    float least = 0.5 * uTexel;
    // Thinner than half a pixel draws fainter rather than clamping, or a size signal could not thin the line.
    float radius = max(aDab.z, least);

    vFlow = aDab.w * min(1.0, aDab.z / least);
    vInner = radius * uHardness;
    vReach = radius + least;
    vLocal = CORNERS[gl_VertexID] * vReach;

    vec2 at = (aDab.xy + vLocal) * 2.0 - 1.0;
    gl_Position = vec4(at.x, at.y * uFlip, 0.0, 1.0);
}
