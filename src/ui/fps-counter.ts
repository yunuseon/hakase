import { animationFrameScheduler, type Observable } from 'rxjs';
import { bufferTime, map, tap } from 'rxjs/operators';

export const reportFps$ =
    (container: HTMLElement) =>
    (frames$: Observable<unknown>): Observable<number> => {
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
