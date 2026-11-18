import process from 'node:process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = ts.readConfigFile(join(root, 'tsconfig.core.json'), ts.sys.readFile).config;

const filesUnder = directory =>
    readdirSync(directory).flatMap(name => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? filesUnder(path) : path.endsWith('.ts') ? [path] : [];
    });

const entries = [
    ...config.files.map(file => join(root, file)),
    ...config.include.flatMap(directory => filesUnder(join(root, directory))),
];

// The browser's side of the app: the core may reach none of it, by any import, type imports included.
const VIEW = [
    'src/components/',
    'src/programs/',
    'src/engine/',
    'src/storybook/',
    'src/program.ts',
    'src/programs.ts',
    'src/process.ts',
    'src/main.ts',
    'src/browser-ports.ts',
    'src/lib/dom.ts',
    'src/lib/rx.ts',
    'src/lib/storage.ts',
];
const PACKAGES = /^(lit-html|lit)(\/|$)|^node:|^(fs|path|os|child_process|process|url)(\/|$)/;
const PLATFORM = /\banimationFrames\b/;

const from = new Map();
const findings = [];
const chainOf = path => {
    const chain = [];
    for (let at = path; at !== undefined; at = from.get(at)) chain.unshift(relative(root, at));
    return chain.join(' → ');
};

const visit = (path, parent) => {
    if (from.has(path)) return;
    from.set(path, parent);
    const name = relative(root, path);
    if (VIEW.some(view => name.startsWith(view))) {
        findings.push(`reaches the browser's ${name}: ${chainOf(path)}`);
        return;
    }
    const source = readFileSync(path, 'utf8');
    if (PLATFORM.test(source)) {
        findings.push(`ticks on animationFrames, which is the frames$ port's: ${chainOf(path)}`);
    }
    for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
        if (fileName.includes('?inline')) {
            findings.push(`imports a stylesheet (${fileName}): ${chainOf(path)}`);
        } else if (PACKAGES.test(fileName)) {
            findings.push(`imports ${fileName}, which not every client has: ${chainOf(path)}`);
        } else if (fileName.startsWith('.')) {
            const target = resolve(dirname(path), fileName.replace(/\?.*$/, ''));
            if (target.endsWith('.ts') && existsSync(target)) visit(target, path);
        }
    }
};

for (const entry of entries) visit(entry, undefined);

if (findings.length > 0) {
    process.stderr.write(
        `The core must run for any client (tsconfig.core.json):\n${findings.map(line => `  ${line}`).join('\n')}\n`,
    );
    process.exit(1);
}

process.stdout.write(
    `Layer check passed: ${from.size} core modules reach no view, browser package or frame loop.\n`,
);
