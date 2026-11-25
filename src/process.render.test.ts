import { afterEach, describe, expect, it, vi } from 'vitest';
import { concat, of, throwError } from 'rxjs';
import { contained$ } from './process.ts';

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('a process', () => {
    it('keeps what its program emitted, and shows its failure in its own window instead of ending', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const window = document.createElement('div');
        window.append(document.createElement('hks-program-content'));
        document.body.append(window);
        const emitted: string[] = [];
        const errors: unknown[] = [];
        const completed: boolean[] = [];

        const running = contained$(
            concat(
                of('first'),
                throwError(() => new Error('Unavailable renderer')),
            ),
            window,
        ).subscribe({
            next: value => emitted.push(value),
            error: error => errors.push(error),
            complete: () => completed.push(true),
        });

        expect(emitted).toEqual(['first']);
        expect(errors).toEqual([]);
        expect(completed).toEqual([]);
        expect(window.querySelector('hks-program-content')).toBeNull();
        expect(window.querySelector('hks-failure')?.shadowRoot?.textContent).toContain(
            'Unavailable renderer',
        );

        running.unsubscribe();
    });
});
