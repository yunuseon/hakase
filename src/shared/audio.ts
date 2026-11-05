import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

// One context for every voice and drum machine: a browser allows only a few, and it is closed when the last voice stops listening.
export const context$ = new Observable<AudioContext>(subscriber => {
    const context = new AudioContext();

    void context.resume();
    subscriber.next(context);

    // Not at once: the voices' release fades are scheduled on this context, and closing cuts them off with a click.
    return () => {
        setTimeout(() => {
            void context.close();
        }, 250);
    };
}).pipe(shareReplay({ bufferSize: 1, refCount: true }));
