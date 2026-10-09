import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const componentUrl = new URL('../../src/components/promo-link.tsx', import.meta.url).href;
registerHooks({
  load(url, context, nextLoad) {
    if (url !== componentUrl) return nextLoad(url, context);
    return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
  },
});
const { PromoLink } = await import(componentUrl);
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://star.zijiu522.cn' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(t, clipboard) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(PromoLink)));
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  });
  return {
    anchor: container.querySelector('a'),
    message: () => container.querySelector('[role="status"]').textContent,
    async click() {
      const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
      await act(async () => container.querySelector('a').dispatchEvent(event));
      assert.equal(event.defaultPrevented, false, 'Navigation must not wait for clipboard permission');
    },
  };
}

test('promo uses a black/white external link with native new-tab navigation', async (t) => {
  const view = await mount(t, { writeText: async () => {} });
  assert.equal(view.anchor.href, 'https://wzyp.cn/shop/RYFLI40K');
  assert.equal(view.anchor.target, '_blank');
  for (const rel of ['noopener', 'noreferrer', 'sponsored']) assert.ok(view.anchor.relList.contains(rel));
  assert.ok(view.anchor.classList.contains('bg-black'));
  assert.ok(view.anchor.classList.contains('text-white'));
  assert.ok(view.anchor.classList.contains('whitespace-nowrap'));
  assert.equal(view.message(), '');
});

test('copy success writes the exact coupon and feedback resets', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const copies = [];
  const view = await mount(t, { writeText: async (value) => copies.push(value) });
  await view.click();
  assert.deepEqual(copies, ['starhub']);
  assert.equal(view.message(), '优惠码 starhub 已复制');
  await act(async () => t.mock.timers.tick(2500));
  assert.equal(view.message(), '');
});

test('clipboard denial is visible, keeps the coupon and can be retried', async (t) => {
  const clipboard = { writeText: async () => { throw new Error('Permission denied'); } };
  const view = await mount(t, clipboard);
  await view.click();
  assert.equal(view.message(), '复制失败，请手动输入优惠码 starhub');
  assert.ok(view.anchor.textContent.includes('请用 starhub'));
  assert.ok(!view.anchor.textContent.includes('已复制'));
  clipboard.writeText = async () => {};
  await view.click();
  assert.equal(view.message(), '优惠码 starhub 已复制');
});

test('missing clipboard API reports failure without pretending to copy', async (t) => {
  const view = await mount(t, undefined);
  await view.click();
  assert.equal(view.message(), '复制失败，请手动输入优惠码 starhub');
});

test('pending clipboard does not announce success or block the link', async (t) => {
  let resolve;
  const view = await mount(t, { writeText: () => new Promise((r) => { resolve = r; }) });
  await view.click();
  assert.equal(view.message(), '');
  await act(async () => resolve());
  assert.equal(view.message(), '优惠码 starhub 已复制');
});

test('late results from earlier clicks cannot overwrite the latest result', async (t) => {
  let rejectFirst;
  let count = 0;
  const view = await mount(t, { writeText: () => ++count === 1
    ? new Promise((resolve, reject) => { rejectFirst = reject; }) : Promise.resolve() });
  await view.click();
  await view.click();
  assert.equal(view.message(), '优惠码 starhub 已复制');
  await act(async () => rejectFirst(new Error('Old denied request')));
  assert.equal(view.message(), '优惠码 starhub 已复制');
});
