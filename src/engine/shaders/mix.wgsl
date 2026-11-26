// amount; choice in the order of MIX_MODES: over, add, screen, multiply, difference
@fragment
fn main(v: Varying) -> @location(0) vec4f {
    let a = textureSample(in0, bilinear, at(v.uv)).rgb;
    let b = textureSample(in1, bilinear, at(v.uv)).rgb;
    var blended = abs(a - b);

    switch settings.choice {
        case 0: {
            blended = b;
        }
        case 1: {
            blended = min(a + b, vec3f(1.0));
        }
        case 2: {
            blended = 1.0 - (1.0 - a) * (1.0 - b);
        }
        case 3: {
            blended = a * b;
        }
        default: {}
    }

    return vec4f(mix(a, blended, knob(0)), 1.0);
}
