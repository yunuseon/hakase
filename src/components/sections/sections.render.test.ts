import { afterEach, expect, it } from 'vitest';
import { merge, of } from 'rxjs';
import { HksSections } from './sections.component.ts';
import { requireElement } from '../../lib/dom.ts';
import type { SectionGesture } from './sections.ts';
afterEach(() => document.body.replaceChildren());
it('draws a cutout and renames through the shadow-root change event', () => {
    const element = new HksSections();
    document.body.append(element);
    const gestures: SectionGesture[] = [];
    const running = merge(
        element.connect$(
            of([
                {
                    id: 'area',
                    name: 'Area',
                    rects: [
                        { x: 0, y: 0, width: 200, height: 50 },
                        { x: 0, y: 50, width: 50, height: 150 },
                    ],
                },
            ]),
        ),
        element.gestures$,
    ).subscribe(value => {
        if (value !== undefined) gestures.push(value);
    });
    const root = element.shadowRoot ?? element;
    expect(root.querySelector('.edge')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    const name = requireElement(root, '.name', HTMLInputElement);
    name.value = 'Renamed';
    name.dispatchEvent(new Event('change', { bubbles: true }));
    expect(gestures).toEqual([{ kind: 'rename', id: 'area', name: 'Renamed' }]);
    running.unsubscribe();
    name.dispatchEvent(new Event('change', { bubbles: true }));
    expect(gestures).toHaveLength(1);
});
