'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'app');
const LANDING = path.join(ROOT, 'landing');

function readPng(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString('ascii'), 'PNG', `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

test('Windows .ico contains the required sizes and valid entries', () => {
  const b = fs.readFileSync(path.join(APP, 'assets', 'icon.ico'));
  assert.equal(b.readUInt16LE(0), 0);
  assert.equal(b.readUInt16LE(2), 1, 'must be an icon (type 1)');
  const count = b.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w = b[off] === 0 ? 256 : b[off];
    const size = b.readUInt32LE(off + 8);
    const offset = b.readUInt32LE(off + 12);
    assert.equal(b.subarray(offset + 1, offset + 4).toString('ascii'), 'PNG');
    assert.ok(size > 0 && offset + size <= b.length);
    sizes.push(w);
  }
  for (const s of [16, 32, 48, 256]) assert.ok(sizes.includes(s), `missing ${s}px entry`);
});

test('macOS .icns has the icns magic and a 1024px PNG entry', () => {
  const b = fs.readFileSync(path.join(APP, 'assets', 'icon.icns'));
  assert.equal(b.subarray(0, 4).toString('ascii'), 'icns');
  assert.equal(b.readUInt32BE(4), b.length, 'declared length must match file size');
  let pos = 8;
  let has1024 = false;
  while (pos < b.length) {
    const tag = b.subarray(pos, pos + 4).toString('ascii');
    const len = b.readUInt32BE(pos + 4);
    if (tag === 'ic10') has1024 = true;
    assert.ok(len >= 8, 'chunk length too small');
    pos += len;
  }
  assert.equal(pos, b.length);
  assert.ok(has1024, 'missing 1024px entry');
});

test('PNG icons have the expected dimensions', () => {
  assert.deepEqual(readPng(path.join(APP, 'assets', 'icon.png')), { width: 1024, height: 1024 });
  assert.deepEqual(readPng(path.join(APP, 'assets', 'icon-512.png')), { width: 512, height: 512 });
  assert.deepEqual(readPng(path.join(LANDING, 'assets', 'favicon-32.png')), { width: 32, height: 32 });
  assert.deepEqual(readPng(path.join(LANDING, 'assets', 'apple-touch-icon.png')), { width: 180, height: 180 });
});

test('the mark is identical in the app, the renderer, and the landing page', () => {
  const a = fs.readFileSync(path.join(APP, 'assets', 'mark.svg'));
  assert.ok(a.equals(fs.readFileSync(path.join(APP, 'renderer', 'assets', 'mark.svg'))));
  assert.ok(a.equals(fs.readFileSync(path.join(LANDING, 'assets', 'mark.svg'))));
  assert.match(a.toString('utf-8'), /^<svg[\s\S]*<\/svg>\s*$/);
});

test('installer config points at icons that exist', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf-8'));
  for (const rel of [pkg.build.mac.icon, pkg.build.win.icon]) {
    assert.ok(fs.existsSync(path.join(APP, rel)), `missing ${rel}`);
  }
  assert.ok(pkg.build.files.some((f) => f.startsWith('assets/')), 'assets must be packaged');
});

test('every local asset referenced by the landing page and the app exists', () => {
  for (const [dir, file] of [[LANDING, 'index.html'], [path.join(APP, 'renderer'), 'index.html']]) {
    const html = fs.readFileSync(path.join(dir, file), 'utf-8');
    const refs = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, `${dir} references no assets`);
    for (const ref of refs) assert.ok(fs.existsSync(path.join(dir, ref)), `${dir}: missing ${ref}`);
  }
});

test('main process sets the window icon from the bundled assets', () => {
  const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf-8');
  assert.match(main, /icon: APP_ICON/);
  assert.ok(fs.existsSync(path.join(APP, 'assets', 'icon.png')));
});
