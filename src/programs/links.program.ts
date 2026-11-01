import { merge } from 'rxjs';
import { ignoreElements, map } from 'rxjs/operators';
import { HksLinks } from '../components/links/links.component.ts';
import type { AppInput, Program } from '../program.ts';

export const linksProgram: Program = {
    id: 'links',
    title: 'links',
    icon: 'M10 14 L14 10 M8.5 11.5 L6.5 13.5 A3.5 3.5 0 0 0 11.5 18.5 L13.5 16.5 M15.5 12.5 L17.5 10.5 A3.5 3.5 0 0 0 12.5 5.5 L10.5 7.5',
    size: { width: 300, height: 320 },
    minimum: { width: 220, height: 180 },
    launch: () => {
        const links = new HksLinks();

        return {
            element: links,
            run$: ({ links$ }) =>
                merge(
                    links.connect$(links$.pipe(map(({ items }) => items))).pipe(ignoreElements()),
                    links.commands$.pipe(map((command): AppInput => ({ kind: 'link', command }))),
                ),
        };
    },
};
