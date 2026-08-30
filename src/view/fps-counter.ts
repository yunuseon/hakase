import { animationFrameScheduler, type Observable } from 'rxjs';
import { bufferTime, map, tap } from 'rxjs/operators';

export const createFpsCounter = (container: HTMLElement) => {
    const counter =
        container.querySelector('hks-fps-counter') ??
        container.appendChild(document.createElement('hks-fps-counter'));

    return {
        connect$: (frames$: Observable<unknown>): Observable<void> =>
            frames$.pipe(
                bufferTime(1000, animationFrameScheduler),
                map(frames => frames.length),
                tap(fps => {
                    counter.textContent = `${fps} fps`;
                }),
                map(() => undefined),
            ),
    };
};
