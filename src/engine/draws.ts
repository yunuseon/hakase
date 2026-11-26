import { fromEvent, type Observable } from 'rxjs';
import { map, mergeMap, scan, share } from 'rxjs/operators';
import { reduceDraws, startDraws, type Drawing, type Redraw } from '../diagnostics.ts';
import { COOKED } from './engine.ts';

const drawingOf = (value: unknown): readonly Drawing[] =>
    value !== null &&
    typeof value === 'object' &&
    'entry' in value &&
    'lane' in value &&
    typeof value.lane === 'string' &&
    'kind' in value &&
    'why' in value &&
    'frame' in value &&
    typeof value.entry === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.why === 'string' &&
    (typeof value.frame === 'number' || value.frame === null)
        ? [
              {
                  entry: value.entry,
                  lane: value.lane,
                  kind: value.kind,
                  why: value.why,
                  frame: value.frame,
              },
          ]
        : [];

const batches$: Observable<readonly Drawing[]> = fromEvent(window, COOKED).pipe(
    map(event => {
        const detail: unknown = event instanceof CustomEvent ? event.detail : null;

        return Array.isArray(detail) ? detail.flatMap(drawingOf) : [];
    }),
    share(),
);

export const draws$: Observable<Drawing> = batches$.pipe(mergeMap(batch => batch));

export const redraws$: Observable<Redraw> = batches$.pipe(
    scan(reduceDraws, startDraws),
    mergeMap(({ redrawn }) => redrawn),
);
