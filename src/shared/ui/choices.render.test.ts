import { afterEach, describe, expect, it } from 'vitest';
import { html } from 'lit-html';
import { merge } from 'rxjs';
import { tap } from 'rxjs/operators';
import { mountView } from '../../lib/lit.ts';
import { requireChild, requireElement } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { connectChoices$ } from './choices.component.ts';

afterEach(() => document.body.replaceChildren());
describe('shared radio-choice adapter', () => {
    it('uses one tab stop, commits one keyboard selection, and releases listeners', async () => {
        const host = document.createElement('div');
        document.body.append(host);
        const root = host.attachShadow({ mode: 'open' });
        const rendering = mountView(
            root,
            () =>
                html`<div role="radiogroup">
                    <button type="button" role="radio" aria-checked="true" data-value="first">
                        First</button
                    ><button type="button" role="radio" aria-checked="false" disabled>
                        Unavailable</button
                    ><button type="button" role="radio" aria-checked="false" data-value="last">
                        Last
                    </button>
                </div>`,
        );
        const group = requireChild(root, '[role="radiogroup"]');
        const first = requireElement(root, '[data-value="first"]', HTMLButtonElement);
        const last = requireElement(root, '[data-value="last"]', HTMLButtonElement);
        const picks: string[] = [];
        const running = merge(
            rendering.lifetime$,
            connectChoices$(root),
            fromElementEvent$(group, 'click').pipe(
                tap(({ target }) => {
                    if (target instanceof HTMLButtonElement) {
                        picks.push(target.textContent?.trim() ?? '');
                        for (const button of group.querySelectorAll('button')) {
                            button.setAttribute('aria-checked', String(button === target));
                        }
                    }
                }),
            ),
        ).subscribe();
        expect(first.tabIndex).toBe(0);
        expect(last.tabIndex).toBe(-1);
        const arrow = new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            bubbles: true,
            composed: true,
            cancelable: true,
        });
        first.dispatchEvent(arrow);
        expect(picks).toEqual(['Last']);
        expect(root.activeElement).toBe(last);
        expect(arrow.defaultPrevented).toBe(true);
        const claimed = new KeyboardEvent('keydown', {
            key: 'ArrowRight',
            bubbles: true,
            composed: true,
            cancelable: true,
        });
        claimed.preventDefault();
        last.dispatchEvent(claimed);
        expect(picks).toEqual(['Last']);
        await Promise.resolve();
        expect(first.tabIndex).toBe(-1);
        expect(last.tabIndex).toBe(0);
        last.disabled = true;
        await Promise.resolve();
        expect(first.tabIndex).toBe(0);
        expect(last.tabIndex).toBe(-1);
        running.unsubscribe();
        first.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }),
        );
        expect(picks).toEqual(['Last']);
        expect(root.childElementCount).toBe(0);
    });
});
