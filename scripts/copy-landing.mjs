import { copyFile, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'landing', 'home');
const target = resolve(root, 'dist', 'landing', 'home');
const appIndex = resolve(root, 'dist', 'index.html');
const appIndexTarget = resolve(root, 'dist', 'app', 'index.html');
const landingIndex = resolve(target, 'index.html');

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await mkdir(resolve(root, 'dist', 'app'), { recursive: true });
await copyFile(appIndex, appIndexTarget);
await copyFile(landingIndex, appIndex);

console.log('Copied landing/home to dist/landing/home and set root index to landing page');
