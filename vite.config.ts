import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const flag = (name: string, fallback: boolean): boolean => {
    const value = process.env[name];
    return value === undefined ? fallback : value === 'true';
};

const RECORDINGS = '/__hakase/recordings/';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// hakase.stop(name) in the console saves its recording here, for a test to replay.
const recordings = (): Plugin => ({
    name: 'hakase-recordings',
    apply: 'serve',
    configureServer: server => {
        server.middlewares.use(RECORDINGS, (request, response) => {
            const name = (request.url ?? '').replace(/^\//, '');
            // The server listens on every interface; only this machine may write into src.
            const local = LOOPBACK.has(request.socket.remoteAddress ?? '');

            if (request.method !== 'POST' || !local || !/^[a-z0-9-]{1,64}$/.test(name)) {
                response.statusCode = 403;
                response.end();
                return;
            }
            const chunks: Buffer[] = [];
            request.on('data', (chunk: Buffer) => chunks.push(chunk));
            request.on('end', () => {
                const path = `src/recordings/${name}.ts`;
                void mkdir('src/recordings', { recursive: true })
                    .then(() => writeFile(path, Buffer.concat(chunks)))
                    .then(() => {
                        response.end(path);
                    });
            });
        });
    },
});

export default defineConfig({
    plugins: [recordings()],
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'logic',
                    environment: 'node',
                    include: ['src/**/*.test.ts'],
                    exclude: ['src/**/*.render.test.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'ui',
                    environment: 'happy-dom',
                    include: ['src/**/*.render.test.ts'],
                },
            },
        ],
    },
    server: {
        // Listen on all interfaces so the server is reachable from outside a container.
        host: true,
        // Opening a browser makes sense on a laptop, not inside one.
        open: flag('VITE_OPEN', true),
        watch: {
            // Bind mounts do not forward filesystem events reliably; polling does.
            usePolling: flag('VITE_POLL', false),
        },
    },
    build: {
        target: 'es2022',
        sourcemap: true,
    },
});
