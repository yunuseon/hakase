import { ignoreElements, map } from 'rxjs/operators';
import { HksImageView } from '../components/image-view/image-view.component.ts';
import type { Shown } from '../components/image-view/image-view.ts';
import { momentOf$, viewRatio$ } from '../engine/moment.ts';
import { view$, type View } from '../engine/view.ts';
import { imageInput, playbackInput } from '../inputs.ts';
import type { Program } from '../program.ts';

export const shownOf =
    (empty: string) =>
    (view: View): Shown =>
        view.kind === 'frame'
            ? view
            : { kind: 'message', text: view.kind === 'empty' ? empty : view.message };

export const outputProgram = {
    id: 'output',
    inputs: { playback: playbackInput, in: imageInput('in') },
    title: 'output',
    category: 'make',
    icon: 'M3 5h18v12H3zM8 21h8M12 17v4',
    size: { width: 480, height: 400 },
    minimum: { width: 220, height: 200 },
    launch: () => {
        const view = new HksImageView();

        return {
            element: view,
            run$: ({ followedImage$, clock$, zoom$ }) =>
                view
                    .connect$(
                        view$(
                            followedImage$('in'),
                            momentOf$(clock$, view.sizes$, viewRatio$(zoom$)),
                        ).pipe(
                            map(
                                shownOf(
                                    'Nothing plugged in. In state mode, wire a sketch into in.',
                                ),
                            ),
                        ),
                    )
                    .pipe(ignoreElements()),
        };
    },
} satisfies Program;
