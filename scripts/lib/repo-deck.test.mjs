import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));
const mocks = {
  "@/app/actions": "export const starRepo = (id) => globalThis.deckTest.star(id); export const verifyStar = starRepo; export const deleteRepo = (id) => globalThis.deckTest.remove(id);",
  "next/navigation": "export const useRouter = () => globalThis.deckTest.router;",
  "next/link": "import React from 'react'; export default function Link(props) { return React.createElement('a', props); }",
  "next/image": "import React from 'react'; export default function Image({ unoptimized, ...props }) { return React.createElement('img', props); }",
  "@/lib/db": "export const listRepos = () => []; export const getStats = () => ({}); export const listStarsGiven = () => globalThis.deckTest.given; export const listStarsReceived = () => globalThis.deckTest.received; export const listReposBySubmitter = () => [];",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in mocks) return { url: `deck-mock:${specifier}`, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const path = sourceRoot + specifier.slice(2);
      const extension = [".ts", ".tsx"].find((ext) => existsSync(path + ext));
      return nextResolve(pathToFileURL(path + extension).href, context);
    }
    if (context.parentURL?.startsWith("deck-mock:")) {
      return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("deck-mock:")) {
      return { format: "module", source: mocks[url.slice(10)], shortCircuit: true };
    }
    if (url.startsWith(pathToFileURL(sourceRoot).href) && /\.tsx?$/.test(url)) {
      const { outputText } = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { RepoDeck } = await import("../../src/components/repo-deck.tsx");
const { StarButton } = await import("../../src/components/star-button.tsx");
const { RepoCard } = await import("../../src/components/repo-card.tsx");
const { RepoGrid } = await import("../../src/components/repo-grid.tsx");
const { HistoryView } = await import("../../src/components/history-view.tsx");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.confirm = () => false;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function repo(id, description = "Repository description") {
  return {
    id, isAvailable: true, fullName: `owner/repo-${id}`, owner: "owner", name: `repo-${id}`, description,
    language: "TypeScript", stargazers: 10, htmlUrl: `https://github.com/owner/repo-${id}`,
    submitterId: "owner", submitter: { id: "owner", login: "owner", avatarUrl: null, xhsName: null }, stars: [],
  };
}

async function mountGrid(t, changes = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const state = globalThis.deckTest = { star: async () => ({ ok: true, message: '已 Star' }),
    router: { refresh() {}, push() {} } };
  let props = { repos: [repo(1), repo(2)], viewer: { id: 'viewer', login: 'alice', isAdmin: false, canStar: true },
    todo: true, emptyMessage: '全部已 Star', starrersOfViewer: [], ...changes };
  const render = async (changes = {}) => {
    props = { ...props, ...changes };
    await act(async () => root.render(React.createElement(RepoGrid, props)));
  };
  await render();
  t.after(async () => { await act(async () => root.unmount()); container.remove(); });
  return { container, state, render, click: async (label = 'Star') => {
    const button = [...container.querySelectorAll('button')].find((button) => button.textContent.trim() === label);
    assert.ok(button);
    await act(async () => button.click());
  } };
}

test('grid removes a successful Star immediately, including from a stale snapshot', async (t) => {
  const grid = await mountGrid(t);
  await grid.click();
  assert.equal(grid.container.querySelectorAll('article').length, 1);
  assert.ok(!grid.container.textContent.includes('repo-1'));
  await grid.render({ repos: [repo(1), repo(2)] });
  assert.equal(grid.container.querySelectorAll('article').length, 1);
  await grid.click('已在 GitHub Star？同步记录');
  assert.equal(grid.container.querySelectorAll('article').length, 0);
  assert.equal(grid.container.querySelector('[role="status"]').textContent, '全部已 Star');
});

test('grid failure keeps the card and retry succeeds; pending is not treated as a Star', async (t) => {
  const grid = await mountGrid(t);
  let resolveStar;
  grid.state.star = () => new Promise((resolve) => { resolveStar = resolve; });
  await grid.click();
  assert.equal(grid.container.querySelectorAll('article').length, 2);
  assert.ok(grid.container.querySelector('button:disabled'));
  await act(async () => resolveStar({ ok: false, message: '连接暂时失败' }));
  assert.ok(grid.container.textContent.includes('连接暂时失败'));
  grid.state.star = async () => ({ ok: true, message: '已 Star' });
  await grid.click();
  assert.equal(grid.container.querySelectorAll('article').length, 1);
});

test('all grid updates both responsive controls and Star details without double counting after refresh', async (t) => {
  const grid = await mountGrid(t, { todo: false, repos: [repo(1)] });
  await grid.click();
  assert.ok(grid.container.textContent.includes('1 人已 Star'));
  assert.equal([...grid.container.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Star').length, 0);
  const updated = { ...repo(1), stars: [{ user: { id: 'viewer', login: 'alice', avatarUrl: null, xhsName: null }, createdAt: '2026-09-13T00:00:00Z' }] };
  await grid.render({ repos: [updated] });
  assert.ok(grid.container.textContent.includes('1 人已 Star'));
  assert.ok(!grid.container.textContent.includes('2 人已 Star'));
});

async function mount(t, repos) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const calls = [];
  const state = globalThis.deckTest = {
    star: async (id) => { calls.push(id); return { ok: true, message: "已 Star" }; },
    router: { refresh() {}, push() {} },
  };
  let props = { repos, doneCount: 10, mineCount: 1, canStar: true, starrersOfViewer: [] };
  const render = async (changes = {}) => {
    props = { ...props, ...changes };
    await act(async () => root.render(React.createElement(RepoDeck, props)));
  };
  await render();
  t.after(async () => {
    await act(async () => root.unmount());
    container.remove();
    t.mock.timers.reset();
  });
  return {
    state, calls, render, container,
    current: () => container.querySelector("article a[title]")?.getAttribute("title") ?? null,
    click: async (label) => {
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent.trim() === label);
      assert.ok(button, `Missing button: ${label}`);
      await act(async () => button.click());
    },
    finish: async () => { await act(async () => t.mock.timers.tick(280)); },
  };
}

test("a server refresh removes repositories already starred elsewhere", async (t) => {
  const deck = await mount(t, [repo(1), repo(2)]);
  await deck.render({ repos: [repo(2)], doneCount: 11 });
  assert.equal(deck.current(), "owner/repo-2");
});

test("confirmed stars cannot return through a stale server snapshot", async (t) => {
  const deck = await mount(t, [repo(1), repo(2)]);
  await deck.click("Star");
  await deck.finish();
  await deck.render({ repos: [repo(1), repo(2), repo(3)] });
  await deck.click("下一张");
  await deck.finish();
  assert.equal(deck.current(), "owner/repo-3");
  await deck.click("下一张");
  await deck.finish();
  assert.equal(deck.current(), "owner/repo-2");
  assert.deepEqual(deck.calls, [1]);
});

test("server revalidation during Star keeps the active card and does not consume the next one", async (t) => {
  const deck = await mount(t, [repo(1), repo(2), repo(3)]);
  let resolveStar;
  deck.state.star = () => new Promise((resolve) => { resolveStar = resolve; });
  await deck.click("Star");
  await deck.render({ repos: [repo(2), repo(3)], doneCount: 11 });
  assert.equal(deck.current(), "owner/repo-1");
  await act(async () => resolveStar({ ok: true, message: "已 Star" }));
  await deck.finish();
  assert.equal(deck.current(), "owner/repo-2");
  await deck.render({ repos: [repo(2), repo(3), repo(4)] });
  await deck.click("下一张");
  await deck.finish();
  assert.equal(deck.current(), "owner/repo-3");
});

test("refresh preserves skip order, updates metadata, and appends new repositories only once", async (t) => {
  const deck = await mount(t, [repo(1), repo(2)]);
  await deck.click("下一张");
  await deck.finish();
  await deck.render({ repos: [repo(1), repo(2, "Updated description"), repo(3), repo(3)] });
  assert.equal(deck.current(), "owner/repo-2");
  assert.ok(deck.container.textContent.includes("Updated description"));
  for (const expected of [1, 3, 2]) {
    await deck.click("下一张");
    await deck.finish();
    assert.equal(deck.current(), `owner/repo-${expected}`);
  }
});

test("failed Star remains available with an error and can be retried", async (t) => {
  const deck = await mount(t, [repo(1), repo(2)]);
  deck.state.star = async () => ({ ok: false, message: "连接暂时失败" });
  await deck.click("Star");
  await deck.finish();
  assert.equal(deck.current(), "owner/repo-1");
  assert.ok(deck.container.textContent.includes("连接暂时失败"));
  deck.state.star = async () => ({ ok: true, message: "已 Star" });
  await deck.click("Star");
  await deck.finish();
  assert.equal(deck.current(), "owner/repo-2");
});

test("finishing the last card stays empty and does not double count acknowledged stars", async (t) => {
  const deck = await mount(t, [repo(1)]);
  await deck.click("Star");
  await deck.finish();
  await deck.render({ repos: [], doneCount: 11 });
  assert.equal(deck.current(), null);
  assert.ok(deck.container.textContent.includes("累计 Star 11 个仓库"));
  await deck.render({ repos: [repo(1)], doneCount: 10 });
  assert.equal(deck.current(), null);
  assert.ok(deck.container.textContent.includes("累计 Star 11 个仓库"));
  await deck.render({ repos: [repo(2)], doneCount: 11 });
  assert.equal(deck.current(), "owner/repo-2");
});

test("a rejected Star request releases the card for retry", async (t) => {
  const deck = await mount(t, [repo(1), repo(2)]);
  deck.state.star = async () => { throw new Error("Connection lost"); };
  await deck.click("Star");
  assert.equal(deck.current(), "owner/repo-1");
  assert.ok(deck.container.textContent.includes("Star 失败，请重试"));
  assert.equal(deck.container.querySelector("button.btn-star").disabled, false);
});

for (const action of ["Star", "已在 GitHub Star？同步记录"]) {
  test(`grid ${action} stays confirmed even if refreshed props lag behind`, async (t) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let calls = 0;
    globalThis.deckTest = {
      star: async () => { calls++; return { ok: true, message: "已 Star" }; },
      router: { refresh() {}, push() {} },
    };
    t.after(async () => { await act(async () => root.unmount()); container.remove(); });
    const render = (starred = false) => root.render(React.createElement(StarButton, {
      repoId: 1, htmlUrl: "https://github.com/bob/one", starred,
      isOwn: false, canDelete: false, loggedIn: true, canStar: true,
    }));
    await act(async () => render());
    const button = [...container.querySelectorAll("button")].find(item => item.textContent.trim() === action);
    await act(async () => button.click());
    await act(async () => render());
    assert.ok(container.textContent.includes("已 Star"));
    assert.equal(container.querySelectorAll("button").length, 0);
    assert.equal(calls, 1);
    await act(async () => render(true));
    await act(async () => render(false));
    assert.ok([...container.querySelectorAll("button")].some(item => item.textContent.trim() === "Star"));
  });
}

for (const starred of [false, true]) {
  test(`repository deletion remains available with starred=${starred} and respects confirmation`, async (t) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const removed = [];
    let refreshes = 0;
    globalThis.deckTest = {
      remove: async (id) => { removed.push(id); return { ok: true }; },
      router: { refresh() { refreshes++; }, push() {} },
    };
    const confirm = t.mock.method(globalThis, "confirm", () => false);
    t.after(async () => { await act(async () => root.unmount()); container.remove(); });
    const render = (canDelete) => root.render(React.createElement(StarButton, {
      repoId: 7, htmlUrl: "https://github.com/bob/one", starred,
      isOwn: true, canDelete, loggedIn: true, canStar: false,
    }));
    await act(async () => render(true));
    const button = container.querySelector('button[aria-label="删除本站仓库"]');
    assert.ok(button);
    assert.ok(button.textContent.includes("删除"));
    await act(async () => button.click());
    assert.deepEqual(removed, []);
    assert.equal(refreshes, 0);
    assert.ok(confirm.mock.calls[0].arguments[0].includes("GitHub 仓库不受影响"));
    confirm.mock.mockImplementation(() => true);
    await act(async () => button.click());
    assert.deepEqual(removed, [7]);
    assert.equal(refreshes, 1);
    await act(async () => render(false));
    assert.equal(container.querySelector('button[aria-label="删除本站仓库"]'), null);
  });
}

test("deletion errors remain visible on starred repositories and allow retry", async (t) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let resolveDelete;
  globalThis.deckTest = {
    remove: () => new Promise((resolve) => { resolveDelete = resolve; }),
    router: { refresh() {}, push() {} },
  };
  t.mock.method(globalThis, "confirm", () => true);
  t.after(async () => { await act(async () => root.unmount()); container.remove(); });
  await act(async () => root.render(React.createElement(StarButton, {
    repoId: 7, htmlUrl: "https://github.com/bob/one", starred: true,
    isOwn: true, canDelete: true, loggedIn: true, canStar: false,
  })));
  const button = container.querySelector('button[aria-label="删除本站仓库"]');
  await act(async () => button.click());
  assert.equal(button.disabled, true);
  await act(async () => resolveDelete({ ok: false, message: "当前无法删除，请重试" }));
  assert.ok(container.textContent.includes("当前无法删除，请重试"));
  assert.equal(button.disabled, false);
  globalThis.deckTest.remove = async () => { throw new Error("Connection lost"); };
  await act(async () => button.click());
  assert.ok(container.textContent.includes("删除失败，请重试"));
  assert.equal(button.disabled, false);
});

test("an unavailable repository keeps management but exposes no Star action", async (t) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  globalThis.deckTest = { router: { refresh() {}, push() {} } };
  t.after(async () => { await act(async () => root.unmount()); });
  await act(async () => root.render(React.createElement(RepoCard, {
    repo: { ...repo(1), isAvailable: false },
    viewer: { id: "owner", login: "owner", isAdmin: false, canStar: true },
  })));
  assert.ok(container.textContent.includes("仓库暂不可访问"));
  assert.ok(container.querySelector('button[aria-label="删除本站仓库"]'));
  assert.equal([...container.querySelectorAll('button')].filter((button) => button.textContent.trim() === 'Star').length, 0);
  assert.equal(container.querySelector('a[title="打开 GitHub"]'), null);
});

test("history retains inaccessible repositories and labels their preserved Star records", async (t) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const person = { id: 'owner', login: 'Ashmmmmmmmmmmmmmmmmmmmmmmmmm', avatarUrl: null, xhsName: null };
  const record = { id: 1, createdAt: '2026-09-01T12:00:00Z', repo: { ...repo(1), isAvailable: false }, user: person, submitter: person };
  globalThis.deckTest = { given: [record], received: [record] };
  t.after(async () => { await act(async () => root.unmount()); });
  await act(async () => root.render(React.createElement(HistoryView, { user: { id: 'viewer', login: 'viewer' }, syncError: null })));
  assert.ok(container.textContent.includes('owner/repo-1'));
  assert.ok(container.textContent.includes('保留历史 Star 记录'));
  assert.ok(container.textContent.includes('已互 Star'));
});
