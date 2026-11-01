import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksBookmarks } from '../components/bookmarks/bookmarks.component.ts';
import type { AppInput, Program } from '../program.ts';

export const bookmarksProgram: Program = {
    id: 'bookmarks',
    title: 'bookmarks',
    category: 'plan',
    icon: 'M7 3.5 H17 V20.5 L12 16.5 L7 20.5 Z',
    size: { width: 320, height: 380 },
    minimum: { width: 240, height: 200 },
    launch: () => {
        const bookmarks = new HksBookmarks();

        return {
            element: bookmarks,
            run$: ({ bookmarks$ }) =>
                merge(
                    bookmarks.connect$(bookmarks$).pipe(ignoreElements()),
                    bookmarks.commands$.pipe(
                        map((command): AppInput => ({ kind: 'bookmark', command })),
                    ),
                ),
        };
    },
};
