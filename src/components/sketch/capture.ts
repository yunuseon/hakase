import { EMPTY, interval, Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

export const CAPTURE_FPS = 30;

export type CaptureFrame = {
    // Where in the loop this frame sits, from 0 up to (not including) 1.
    readonly t: number;
    // False during the warm-up loop, which is drawn but not recorded.
    readonly kept: boolean;
    // From 0 to 1 over the whole capture, warm-up included.
    readonly progress: number;
};

export const captureFrames$ = (seconds: number, warmUp: boolean): Observable<CaptureFrame> => {
    const frames = Math.max(1, Math.round(seconds * CAPTURE_FPS));
    const total = warmUp ? 2 * frames : frames;
    const skipped = total - frames;

    return interval(1000 / CAPTURE_FPS).pipe(
        take(total),
        map(index => ({
            t: ((index - skipped + frames) % frames) / frames,
            kept: index >= skipped,
            progress: (index + 1) / total,
        })),
    );
};

const MIME_TYPES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
] as const;

export const videoType = (): string | undefined =>
    typeof MediaRecorder === 'undefined'
        ? undefined
        : MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type));

// Not a live captureStream(30): only frames requested here are recorded, so a slow tab drops none.
export const recordCanvas$ = (
    canvas: HTMLCanvasElement,
    frames$: Observable<CaptureFrame>,
): Observable<Blob> => {
    const type = videoType();

    if (type === undefined) {
        return EMPTY;
    }

    return new Observable<Blob>(subscriber => {
        const stream = canvas.captureStream(0);
        const [track] = stream.getVideoTracks();
        const recorder = new MediaRecorder(stream, {
            mimeType: type,
            videoBitsPerSecond: 12_000_000,
        });
        const chunks: Blob[] = [];

        recorder.addEventListener('dataavailable', event => {
            chunks.push(event.data);
        });
        recorder.addEventListener('stop', () => {
            subscriber.next(new Blob(chunks, { type }));
            subscriber.complete();
        });
        recorder.start();

        const frames = frames$.pipe(filter(({ kept }) => kept)).subscribe({
            next: () => {
                if (track instanceof CanvasCaptureMediaStreamTrack) {
                    track.requestFrame();
                }
            },
            complete: () => {
                recorder.stop();
            },
        });

        return () => {
            frames.unsubscribe();

            if (recorder.state !== 'inactive') {
                recorder.stop();
            }

            stream.getTracks().forEach(each => {
                each.stop();
            });
        };
    });
};

export const snapshot$ = (canvas: HTMLCanvasElement): Observable<Blob> =>
    new Observable<Blob>(subscriber => {
        canvas.toBlob(blob => {
            if (blob !== null) {
                subscriber.next(blob);
            }

            subscriber.complete();
        }, 'image/png');
    });
