import { combineLatest, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { HksLinearSlider } from '../components/slider/linear/linear-slider.component.ts';
import { HksTransport } from '../components/transport/transport.component.ts';
import type { Program } from '../program.ts';
import { clockLabel } from '../shared/playhead.ts';

export const timeline = new HksLinearSlider();

export const transport = new HksTransport();
transport.slot = 'controls';
timeline.append(transport);

export const timelineProgram: Program = {
    id: 'timeline',
    title: 'timeline',
    kind: 'floating',
    content: timeline,
    connect$: ({ playhead$, playing$, duration$ }) => {
        const clock$ = combineLatest([playhead$, duration$]).pipe(
            map(([at, duration]) => clockLabel(at, duration)),
        );

        return merge(timeline.connect$(playhead$), transport.connect$(playing$, clock$));
    },
};
