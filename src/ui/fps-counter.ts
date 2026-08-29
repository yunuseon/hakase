import { animationFrameScheduler, type Observable } from 'rxjs';
import { bufferTime, map, tap } from 'rxjs/operators';

/**
 * Counts how many frames the source emits per second and writes the result into
 * a small element appended to `container`.
 */
export const reportFps =
    <T>(container: HTMLElement) =>
    (frames$: Observable<T>): Observable<number> => {
        const counter =
            container.querySelector('hks-fps-counter') ??
            container.appendChild(document.createElement('hks-fps-counter'));

        return frames$.pipe(
            bufferTime(1000, animationFrameScheduler),
            map(frames => frames.length),
            tap(fps => {
                counter.textContent = `${fps} fps`;
            }),
        );
    };
