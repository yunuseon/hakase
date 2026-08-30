import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { createSketch, type SketchResult } from './gl/sketch-program.ts';

/**
 * The formula stage: source text in, a compiled shader or a message out.
 * A free function rather than a method on the canvas element, because it
 * produces app state instead of displaying it — it needs the GL context, not
 * the component.
 */
export const compileFormula$ = (
    gl: WebGL2RenderingContext,
    source$: Observable<string>,
): Observable<SketchResult> => source$.pipe(map(source => createSketch(gl, source)));
