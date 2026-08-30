import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { createSketch, type SketchResult } from './gl/sketch-program.ts';

export const compileFormula$ = (
    gl: WebGL2RenderingContext,
    source$: Observable<string>,
): Observable<SketchResult> => source$.pipe(map(source => createSketch(gl, source)));
