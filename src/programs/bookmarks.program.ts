import { declarations } from '../declarations.ts';
import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import type { Program } from '../program.ts';
import type { AppInput } from '../protocol.ts';

export const bookmarksProgram = {
    ...declarations.bookmarks,
    size: { width: 320, height: 380 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const { HksBookmarks } = await import('../components/bookmarks/bookmarks.component.ts');
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
} satisfies Program;
