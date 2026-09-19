import { randomInt } from "node:crypto";
import { gunzipSync } from "node:zlib";

const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; StarHubFeishuSync/1.0) Chrome/152 Safari/537.36";

class CookieJar {
  cookies = new Map();

  add(response) {
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function isFeishuHost(hostname) {
  return hostname === "feishu.cn" || hostname.endsWith(".feishu.cn");
}

function assertSourceUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !isFeishuHost(url.hostname)) {
    throw new Error("飞书同步地址必须是 feishu.cn 的 HTTPS 链接");
  }
  if (!/^\/wiki\/[A-Za-z0-9]+\/?$/.test(url.pathname)) {
    throw new Error("飞书同步地址必须是公开 Wiki 文档链接");
  }
  url.search = "";
  url.hash = "";
  return url;
}

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

async function fetchPublicPage(sourceUrl, jar) {
  let currentUrl = sourceUrl;
  for (let redirects = 0; redirects < 10; redirects += 1) {
    const response = await fetchWithTimeout(currentUrl, {
      headers: {
        ...(jar.header() ? { Cookie: jar.header() } : {}),
        "User-Agent": USER_AGENT,
      },
      redirect: "manual",
    });
    jar.add(response);

    if (response.status < 300 || response.status >= 400) {
      if (!response.ok) throw new Error(`飞书页面读取失败：HTTP ${response.status}`);
      return { response, currentUrl };
    }

    const location = response.headers.get("location");
    if (!location) throw new Error("飞书页面重定向缺少目标地址");
    currentUrl = new URL(location, currentUrl);
    if (!isFeishuHost(currentUrl.hostname)) throw new Error("飞书页面重定向到了非飞书域名");
  }
  throw new Error("飞书页面重定向次数过多");
}

function parsePublicMetadata(html) {
  const wikiMatch = html.match(/window\.current_space_wiki\s*=\s*Object\((\{.+?\})\);/s);
  const metaMatch = html.match(/window\.metaCache\s*=\s*Object\((\{.+?\})\);\s*window\.globalKaConfig/s);
  if (!wikiMatch || !metaMatch) throw new Error("飞书页面缺少公开表格元数据，请确认链接仍可公开访问");

  const wiki = JSON.parse(wikiMatch[1]);
  const metaCache = JSON.parse(metaMatch[1]);
  const encrypted = metaCache[wiki.obj_token]?.encrypted;
  if (!wiki.obj_token || !wiki.wiki_token || !encrypted) {
    throw new Error("飞书页面的公开表格元数据不完整");
  }
  return { wiki, encrypted };
}

function readVarint(buffer, state) {
  let value = 0n;
  let shift = 0n;
  while (state.offset < buffer.length && shift <= 63n) {
    const byte = buffer[state.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) throw new Error("飞书表格数据中的整数超出安全范围");
      return number;
    }
    shift += 7n;
  }
  throw new Error("飞书表格数据中的 varint 无效");
}

function parseMessage(buffer) {
  const state = { offset: 0 };
  const fields = new Map();
  while (state.offset < buffer.length) {
    const key = readVarint(buffer, state);
    const field = key >>> 3;
    const wire = key & 7;
    let value;

    if (wire === 0) value = readVarint(buffer, state);
    else if (wire === 1) {
      value = buffer.subarray(state.offset, state.offset + 8);
      state.offset += 8;
    } else if (wire === 2) {
      const length = readVarint(buffer, state);
      value = buffer.subarray(state.offset, state.offset + length);
      state.offset += length;
    } else if (wire === 5) {
      value = buffer.subarray(state.offset, state.offset + 4);
      state.offset += 4;
    } else {
      throw new Error(`飞书表格数据使用了不支持的 protobuf wire type：${wire}`);
    }

    if (state.offset > buffer.length) throw new Error("飞书表格数据被截断");
    const values = fields.get(field) ?? [];
    values.push({ wire, value });
    fields.set(field, values);
  }
  return fields;
}

function bytes(fields, field) {
  return (fields.get(field) ?? []).filter((entry) => entry.wire === 2).map((entry) => entry.value);
}

function firstVarint(fields, field, fallback = 0) {
  const entry = (fields.get(field) ?? []).find((candidate) => candidate.wire === 0);
  return entry?.value ?? fallback;
}

function decodePackedVarints(buffer) {
  const state = { offset: 0 };
  const values = [];
  while (state.offset < buffer.length) values.push(readVarint(buffer, state));
  return values;
}

function decodeCellBlock(encodedBlock) {
  const root = parseMessage(gunzipSync(Buffer.from(encodedBlock, "base64")));
  for (const operationBuffer of bytes(root, 1)) {
    const operation = parseMessage(operationBuffer);
    for (const commandBuffer of bytes(operation, 2)) {
      const command = parseMessage(commandBuffer);
      for (const sheetBuffer of bytes(command, 12)) {
        const sheet = parseMessage(sheetBuffer);
        const rangeBuffer = bytes(sheet, 1)[0];
        const valuesBuffer = bytes(sheet, 2)[0];
        const gridBuffer = bytes(sheet, 6)[0];
        if (!rangeBuffer || !valuesBuffer || !gridBuffer) continue;

        const range = parseMessage(rangeBuffer);
        const rowStart = firstVarint(range, 1);
        const colStart = firstVarint(range, 2);
        const rowCount = firstVarint(range, 3);
        const colCount = firstVarint(range, 4);
        const valueFields = parseMessage(valuesBuffer);
        const valueTable = bytes(valueFields, 2).map((value) => value.toString("utf8"));
        const packedIndexes = bytes(parseMessage(gridBuffer), 1)[0];
        if (!packedIndexes) throw new Error("飞书表格数据缺少单元格索引");
        const indexes = decodePackedVarints(packedIndexes);
        if (indexes.length !== rowCount * colCount) {
          throw new Error("飞书表格数据的行列数量与单元格索引不一致");
        }

        const cells = [];
        const warnings = [];
        for (let index = 0; index < indexes.length; index += 1) {
          const valueIndex = indexes[index];
          const value = valueIndex === 0 ? "" : valueTable[valueIndex - 1];
          if (value === undefined) {
            warnings.push({
              row: rowStart + Math.floor(index / colCount) + 1,
              column: colStart + (index % colCount) + 1,
              reason: "单元格值缺失，已按空值处理",
            });
          }
          cells.push(value ?? "");
        }
        return { rowStart, colStart, rowCount, colCount, cells, warnings };
      }
    }
  }
  throw new Error("飞书表格数据块中没有可识别的单元格数据");
}

function decodeRows(payload) {
  const snapshot = payload.data?.snapshot;
  const sheetId = payload.data?.sheetId;
  if (!snapshot?.blocks || !snapshot.gzipBlockMeta || !sheetId) {
    throw new Error("飞书没有返回完整的表格快照");
  }

  const blockMeta = JSON.parse(gunzipSync(Buffer.from(snapshot.gzipBlockMeta, "base64")).toString("utf8"));
  const expectedBlocks = (blockMeta[sheetId]?.cellBlockMetas ?? [])
    .filter((block) => block.size > 0)
    .map((block) => block.blockId);
  const missingBlocks = expectedBlocks.filter((blockId) => !snapshot.blocks[blockId]);
  if (missingBlocks.length > 0) {
    throw new Error(`飞书只返回了部分表格数据，缺少 ${missingBlocks.length} 个数据块`);
  }

  const rows = new Map();
  const warnings = [];
  let maxColumn = 0;
  for (const encodedBlock of Object.values(snapshot.blocks)) {
    const block = decodeCellBlock(encodedBlock);
    warnings.push(...block.warnings);
    maxColumn = Math.max(maxColumn, block.colStart + block.colCount);
    for (let row = 0; row < block.rowCount; row += 1) {
      const absoluteRow = block.rowStart + row;
      const values = rows.get(absoluteRow) ?? [];
      for (let column = 0; column < block.colCount; column += 1) {
        values[block.colStart + column] = block.cells[row * block.colCount + column];
      }
      rows.set(absoluteRow, values);
    }
  }

  const decodedRows = [...rows]
    .sort(([left], [right]) => left - right)
    .map(([rowIndex, values]) => ({ rowIndex, values: Array.from({ length: maxColumn }, (_, index) => values[index] ?? "") }));
  return { rows: decodedRows, warnings };
}

function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "");
}

function looksLikeRepository(value) {
  const text = String(value ?? "").trim();
  return /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(text)
    || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(text);
}

export function extractRepositoryRows(rows) {
  const repoHeaders = new Set(["git仓库地址", "github仓库地址", "github地址", "仓库地址"]);
  const xhsHeaders = new Set(["小红书用户名", "小红书账号", "小红书"]);
  const header = rows.find(({ values }) => values.some((value) => repoHeaders.has(normalizeHeader(value))));
  if (!header) throw new Error("飞书表格中找不到“git仓库地址”列");

  const repoColumn = header.values.findIndex((value) => repoHeaders.has(normalizeHeader(value)));
  const xhsColumn = header.values.findIndex((value) => xhsHeaders.has(normalizeHeader(value)));
  if (xhsColumn < 0) throw new Error("飞书表格中找不到“小红书用户名”列");
  const activeColumnCount = Math.max(
    repoColumn,
    xhsColumn,
    header.values.reduce((last, value, index) => (String(value).trim() ? index : last), -1),
  ) + 1;

  return rows
    .filter(({ rowIndex }) => rowIndex > header.rowIndex)
    .filter(({ values }) => values.some((value) => String(value).trim()))
    .map(({ rowIndex, values }) => {
      const detectedRepoColumn = looksLikeRepository(values[repoColumn])
        ? repoColumn
        : values.findIndex(looksLikeRepository);
      const rowRepoColumn = detectedRepoColumn >= 0 ? detectedRepoColumn : repoColumn;
      const columnShift = rowRepoColumn - repoColumn;
      const rowXhsColumn = ((xhsColumn + columnShift) % activeColumnCount + activeColumnCount) % activeColumnCount;

      return {
        sourceRow: rowIndex + 1,
        repo: String(values[rowRepoColumn] ?? "").trim(),
        xhsName: String(values[rowXhsColumn] ?? "").trim() || null,
      };
    });
}

export async function fetchPublicFeishuRepositoryRows(source) {
  const sourceUrl = assertSourceUrl(source);
  const jar = new CookieJar();
  const { response: pageResponse, currentUrl } = await fetchPublicPage(sourceUrl, jar);
  const html = await pageResponse.text();
  if (html.length > 5_000_000) throw new Error("飞书页面体积异常，已停止同步");
  const { wiki, encrypted } = parsePublicMetadata(html);

  const response = await fetchWithTimeout(new URL("/space/api/v3/sheet/client_vars", currentUrl), {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Cookie: jar.header(),
      Referer: sourceUrl.href,
      "User-Agent": USER_AGENT,
      "ccm-meta": JSON.stringify({ [wiki.obj_token]: encrypted }),
      "docs-host-id": wiki.wiki_token,
      "docs-host-type": "Wiki",
      "x-command": "api.sheet.rce.msg",
    },
    body: JSON.stringify({
      memberId: randomInt(10_000_000_000_000, 100_000_000_000_000),
      schemaVersion: 9,
      openType: 0,
      token: wiki.obj_token,
      sheetRange: { sheetId: "" },
      clientVersion: "v0.0.1",
    }),
  });
  if (!response.ok) throw new Error(`飞书表格读取失败：HTTP ${response.status}`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("飞书表格返回了无法解析的响应");
  }
  if (payload.code !== 0) throw new Error(`飞书表格读取失败：${payload.msg || `错误码 ${payload.code}`}`);

  const decoded = decodeRows(payload);
  const rows = extractRepositoryRows(decoded.rows);
  return {
    revision: payload.data.revision,
    sheetId: payload.data.sheetId,
    rows,
    warnings: decoded.warnings,
  };
}
