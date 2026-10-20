'use strict';

// Checks that the landing page keeps the privacy promises it makes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LANDING = path.resolve(__dirname, '..', '..', 'landing');
const html = fs.readFileSync(path.join(LANDING, 'index.html'), 'utf-8');
const css = fs.readFileSync(path.join(LANDING, 'styles.css'), 'utf-8');
const js = fs.readFileSync(path.join(LANDING, 'script.js'), 'utf-8');

test('landing page has no external scripts, styles, fonts, or images', () => {
  const external = html.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+["']/gi) || [];
  assert.deepEqual(external, []);
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/i);
  assert.doesNotMatch(js, /https?:\/\//);
});

test('landing page enforces a restrictive content security policy', () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /default-src 'none'/);
});

test('landing page has no inline scripts or event-handler attributes', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test('every in-page anchor points to an existing id', () => {
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  ids.add('top');
  for (const a of anchors) assert.ok(ids.has(a), `missing target #${a}`);
});

test('landing page describes the app only with features the app has, and labels the rest', () => {
  // Guard against overclaiming: built features are stated plainly; unbuilt ones carry a status tag.
  assert.match(html, /never used for training/i);
  assert.match(html, /Planned/);
  assert.match(html, /Next release/);
  assert.match(html, /file and line number/i);
});

test('landing page does not claim signed or released builds that do not exist yet', () => {
  assert.match(html, /Links are added when the first signed release is published/);
});

test('no inline style attributes (CSP style-src self would block them)', () => {
  assert.doesNotMatch(html, /\sstyle\s*=/i);
});

test('script never builds HTML from strings', () => {
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('motion respects reduced-motion preference in both CSS and JS', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(js, /prefers-reduced-motion: reduce/);
});

test('motion graphics are present: animated pipeline, marquee, and scroll reveal', () => {
  assert.match(html, /<animateMotion/);
  assert.match(css, /@keyframes marquee/);
  assert.match(js, /IntersectionObserver/);
});

test('no external scripts or stylesheets are loaded for animation libraries', () => {
  assert.doesNotMatch(html, /gsap|lottie|framer|three\.js|aos\.js/i);
});
