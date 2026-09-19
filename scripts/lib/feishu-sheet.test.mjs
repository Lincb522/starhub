import assert from "node:assert/strict";
import test from "node:test";
import { extractRepositoryRows } from "./feishu-sheet.mjs";

const header = { rowIndex: 0, values: ["小红书用户名", "git仓库地址", "仓库简介", ""] };

test("extracts rows that follow the declared columns", () => {
  const rows = extractRepositoryRows([
    header,
    { rowIndex: 1, values: ["三脚喵", "https://github.com/example/first", "简介", ""] },
  ]);

  assert.deepEqual(rows, [
    { sourceRow: 2, repo: "https://github.com/example/first", xhsName: "三脚喵" },
  ]);
});

test("detects a cyclically shifted repository row and keeps its matching xhs account", () => {
  const rows = extractRepositoryRows([
    header,
    { rowIndex: 7, values: ["https://github.com/example/shifted", "仓库简介", "小红书账号", ""] },
  ]);

  assert.deepEqual(rows, [
    { sourceRow: 8, repo: "https://github.com/example/shifted", xhsName: "小红书账号" },
  ]);
});

test("keeps a shifted repository row when its xhs cell is missing", () => {
  const rows = extractRepositoryRows([
    header,
    { rowIndex: 21, values: ["https://github.com/example/latest", "仓库简介", "", ""] },
  ]);

  assert.deepEqual(rows, [
    { sourceRow: 22, repo: "https://github.com/example/latest", xhsName: null },
  ]);
});
