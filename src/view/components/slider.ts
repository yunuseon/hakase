import type { Observable } from 'rxjs';

export interface Slider {
    readonly changes$: Observable<number>;
}
