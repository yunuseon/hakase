import type { Observable } from 'rxjs';

export interface Slider {
    readonly changes$: Observable<number>;
    connect$(playhead$: Observable<number>): Observable<void>;
}
