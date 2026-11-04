import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { parseHexColor } from '../../lib/color.ts';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { guidesOf, isSymmetry, symmetryGlyph, SYMMETRIES } from '../../shared/brush.ts';
import { frameAt, isSide, SIZES, type Frame, type Picture } from '../../shared/picture.ts';
import { isMode, MAX_WEIGHT, MODES, penAt, type Drawing, type PenCommand } from './pen.ts';
import css from './pen.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `
    <div class="bar">
        <div class="modes" role="radiogroup" aria-label="mode">
            ${MODES.map(
                mode =>
                    `<button type="button" role="radio" data-mode="${mode}" title="${
                        mode === 'draw'
                            ? 'the line is drawn across the loop, and starts again with it'
                            : 'the whole figure at once'
                    }">${mode}</button>`,
            ).join('')}
        </div>
        <label class="dial" title="how thick the line is; a size signal swells it">
            <span>weight</span>
            <input type="range" data-weight min="0.5" max="${MAX_WEIGHT}" step="0.5" />
            <output></output>
        </label>
        <div class="symmetries" role="radiogroup" aria-label="symmetry">
            ${SYMMETRIES.map(
                symmetry =>
                    `<button type="button" role="radio" data-symmetry="${symmetry}" aria-label="${symmetry}" title="${symmetry}">${symmetryGlyph(symmetry)}</button>`,
            ).join('')}
        </div>
    </div>
    <div class="stage">
        <div class="sheet">
            <canvas class="whole" width="1" height="1"></canvas>
            <canvas class="ink" width="1" height="1"></canvas>
            <svg class="guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
            <span class="tip"></span>
        </div>
    </div>
    <div class="foot">
        <p class="hint">Plug signals into <b>x</b> and <b>y</b> in the state menu or in state mode, and the pen follows them. Unplugged, it goes round in a circle.</p>
        <div class="sides" role="radiogroup" aria-label="resolution">
            ${SIZES.map(
                size => `<button type="button" role="radio" data-side="${size}">${size}</button>`,
            ).join('')}
        </div>
    </div>
`;

const dataOf = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null)
        : null;

const drawn = (canvas: HTMLCanvasElement, frame: Frame, side: number, hex: string) => {
    const context = canvas.getContext('2d');

    if (context === null) {
        return;
    }

    if (canvas.width !== side) {
        canvas.width = side;
        canvas.height = side;
    }

    const { r, g, b } = parseHexColor(hex);
    const image = context.createImageData(side, side);

    frame.forEach((ink, index) => {
        image.data[index * 4] = Math.round(r * 255);
        image.data[index * 4 + 1] = Math.round(g * 255);
        image.data[index * 4 + 2] = Math.round(b * 255);
        image.data[index * 4 + 3] = ink;
    });
    context.putImageData(image, 0, 0);
};

export class HksPen extends HTMLElement {
    readonly changes$: Observable<PenCommand>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        // From the host, as what was really clicked: inside a shadow root the event is retargeted to it.
        const picked$ = fromElementEvent$(this, 'click').pipe(
            mergeMap((event): PenCommand[] => {
                const target = event.composedPath()[0] ?? null;
                const mode = dataOf(target, 'mode');
                const symmetry = dataOf(target, 'symmetry');
                const side = Number(dataOf(target, 'side'));

                return mode !== null && isMode(mode)
                    ? [{ kind: 'mode', mode }]
                    : symmetry !== null && isSymmetry(symmetry)
                      ? [{ kind: 'symmetry', symmetry }]
                      : isSide(side)
                        ? [{ kind: 'side', side }]
                        : [];
            }),
        );

        const weighed$ = fromElementEvent$(requireChild(shadow, '.bar'), 'input').pipe(
            mergeMap(({ target }): PenCommand[] =>
                target instanceof HTMLInputElement && target.dataset['weight'] !== undefined
                    ? [{ kind: 'weight', weight: Number(target.value) }]
                    : [],
            ),
        );

        this.changes$ = merge(picked$, weighed$);
    }

    connect$(
        drawing$: Observable<Drawing>,
        picture$: Observable<Picture>,
        t$: Observable<number>,
    ): Observable<void> {
        const shadow = this.shadow;
        const whole = requireElement(shadow, '.whole', HTMLCanvasElement);
        const ink = requireElement(shadow, '.ink', HTMLCanvasElement);
        const guides = requireElement(shadow, '.guides', SVGSVGElement);
        const tip = requireChild(shadow, '.tip');
        const hint = requireChild(shadow, '.hint');
        const colour = (token: string) =>
            getComputedStyle(this).getPropertyValue(token).trim() || '#000000';

        const checked = (name: string, value: string) => {
            for (const button of shadow.querySelectorAll(`[data-${name}]`)) {
                button.setAttribute(
                    'aria-checked',
                    String(button.getAttribute(`data-${name}`) === value),
                );
            }
        };

        const controls$ = drawing$.pipe(
            map(({ pen, waves }) => ({ pen, plugged: waves.x !== null && waves.y !== null })),
            tap(({ pen, plugged }) => {
                checked('mode', pen.mode);
                checked('symmetry', pen.symmetry);
                checked('side', String(pen.side));

                const weight = requireElement(shadow, '[data-weight]', HTMLInputElement);

                if (weight.value !== String(pen.weight)) {
                    weight.value = String(pen.weight);
                }

                requireChild(shadow, '.dial output').textContent = pen.weight.toFixed(1);
                hint.hidden = plugged;
                guides.replaceChildren(
                    ...guidesOf(pen.symmetry).map(path => {
                        const line = document.createElementNS(SVG, 'path');
                        line.setAttribute('d', path);

                        return line;
                    }),
                );
            }),
        );

        const figure$ = picture$.pipe(
            tap(({ frames, side }) => {
                drawn(whole, frames.at(-1) ?? [], side, colour('--ink'));
            }),
        );

        const now$ = combineLatest([picture$, t$]).pipe(
            map(([picture, t]) => ({
                picture,
                frame: picture.frames[Math.floor(frameAt(picture, t))] ?? picture.frames[0] ?? [],
            })),
            distinctUntilChanged((a, b) => a.frame === b.frame),
            tap(({ picture, frame }) => {
                drawn(ink, frame, picture.side, colour('--ink'));
            }),
        );

        const tip$ = combineLatest([drawing$, t$]).pipe(
            map(([drawing, t]) => penAt(drawing, t)),
            tap(({ x, y }) => {
                tip.style.setProperty('--x', String(x));
                tip.style.setProperty('--y', String(y));
            }),
        );

        return merge(controls$, figure$, now$, tip$).pipe(map(() => undefined));
    }
}

customElements.define('hks-pen', HksPen);
