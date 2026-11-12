/* global window, document, performance, console, innerWidth, innerHeight, devicePixelRatio, PerformanceObserver */
// Paste into the browser console on the running app. It measures frames paused, then with every clock playing, and pauses them again.
(async () => {
    const all = root =>
        [...root.querySelectorAll('*')].flatMap(e => [
            e,
            ...(e.shadowRoot ? all(e.shadowRoot) : []),
        ]);
    const transports = () => all(document).filter(e => e.tagName === 'HKS-TRANSPORT');
    const press = label =>
        transports().forEach(t =>
            t.shadowRoot.querySelector(`button[aria-label="${label}"]`)?.click(),
        );
    const scripts = new Map();
    const running = () =>
        transports().filter(t => t.shadowRoot.querySelector('button[aria-label="pause"]')).length;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback =>
        raf(stamp => {
            const start = performance.now();
            try {
                callback(stamp);
            } finally {
                scripts.set(stamp, (scripts.get(stamp) ?? 0) + performance.now() - start);
            }
        });
    const bitmaps = [];
    const capture = window.createImageBitmap.bind(window);
    window.createImageBitmap = (...args) => {
        const start = performance.now();
        const [source, , , w, h, options] = args;
        const sourced = `${source?.width}x${source?.height}`;
        const pixels = (options?.resizeWidth ?? w ?? 0) * (options?.resizeHeight ?? h ?? 0);
        return capture(...args).then(bitmap => {
            bitmaps.push({ ms: performance.now() - start, pixels: w * h || pixels, sourced });
            return bitmap;
        });
    };
    const long = [];
    const observer = new PerformanceObserver(list => long.push(...list.getEntries()));
    observer.observe({ type: 'long-animation-frame' });
    const measure = async ms => {
        scripts.clear();
        bitmaps.length = 0;
        long.length = 0;
        const gaps = [];
        let last = performance.now();
        const end = last + ms;
        await new Promise(done => {
            const tick = now => {
                gaps.push(now - last);
                last = now;
                if (now < end) {
                    raf(tick);
                } else {
                    done();
                }
            };
            raf(tick);
        });
        const sorted = list => [...list].sort((a, b) => a - b);
        const at = (list, p) =>
            list[Math.min(list.length - 1, Math.floor(p * list.length))]?.toFixed(1);
        const g = sorted(gaps);
        const s = sorted(scripts.values());
        const b = sorted(bitmaps.map(({ ms }) => ms));
        return {
            'clocks playing': running(),
            'app callbacks': s.length,
            fps: Math.round(gaps.length / (ms / 1000)),
            'frame median ms': at(g, 0.5),
            'frame p95 ms': at(g, 0.95),
            'frames over 25 ms': gaps.filter(gap => gap > 25).length,
            'script median ms': at(s, 0.5) ?? '0',
            'script p95 ms': at(s, 0.95) ?? '0',
            'bitmaps per frame': (bitmaps.length / Math.max(gaps.length, 1)).toFixed(1),
            'bitmap median ms': at(b, 0.5) ?? '0',
            'bitmap p95 ms': at(b, 0.95) ?? '0',
            'bitmap Mpx/s': (
                bitmaps.reduce((sum, { pixels }) => sum + pixels, 0) /
                1e6 /
                (ms / 1000)
            ).toFixed(1),
            'source canvas': [...new Set(bitmaps.map(({ sourced }) => sourced))].join(' '),
            'long frames': long.length,
            'long frame ms': long.reduce((sum, e) => sum + e.duration, 0).toFixed(0),
            'long frame render ms': long
                .reduce((sum, e) => sum + e.duration - (e.renderStart - e.startTime), 0)
                .toFixed(0),
        };
    };
    const windows = all(document).filter(e => e.tagName === 'HKS-WINDOW');
    const inView = windows.filter(w => {
        const r = w.getBoundingClientRect();
        return r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
    }).length;
    press('pause');
    const paused = await measure(3000);
    press('play');
    await measure(1000);
    const playing = await measure(5000);
    press('pause');
    window.requestAnimationFrame = raf;
    window.createImageBitmap = capture;
    observer.disconnect();
    console.table({ paused, playing });
    console.log(
        `${transports().length} timelines, ${windows.length} windows, ${inView} in view, ${innerWidth}x${innerHeight} at ${devicePixelRatio}x`,
    );
})();
