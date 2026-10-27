const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");

function harness() {
  let nextReply = null;
  class XHR {
    open() {}
    send() {}
  }
  const requests = [];
  const response = (rows, total = 2) => ({
    status: nextReply?.status || 200,
    ok: !nextReply?.status || nextReply.status < 400,
    url: nextReply?.url || "https://sycm.taobao.com/mc/mq/item/rank.json",
    clone() {
      return this;
    },
    json: async () => nextReply?.body ?? { data: { data: rows, total } },
    text: async () =>
      typeof nextReply?.body === "string"
        ? nextReply.body
        : JSON.stringify(nextReply?.body ?? { data: { data: rows, total } }),
  });
  const w = {
    fetch: async (url) => {
      requests.push(String(url));
      return response([
        { itemId: "1", itemTitle: "商品", payByrCnt: { value: "1万 ~ 2万" } },
      ]);
    },
  };
  const context = vm.createContext({
    window: w,
    document: { cookie: "_tb_token_=fresh-token" },
    location: {
      href: "https://sycm.taobao.com/mc/mq",
      origin: "https://sycm.taobao.com",
      pathname: "/mc/mq",
    },
    URL,
    URLSearchParams,
    Request,
    AbortSignal,
    crypto,
    XMLHttpRequest: XHR,
    console,
    setTimeout,
    Date,
  });
  vm.runInContext(
    fs.readFileSync("../extension/unpacked/market-observer.js", "utf8"),
    context,
  );
  return {
    w,
    requests,
    setReply: (reply) => {
      nextReply = reply;
    },
  };
}
test("observes market requests only and never exposes tokens", async () => {
  const { w } = harness();
  await w.fetch("https://sycm.taobao.com/cc/item/view/top.json?page=1");
  await new Promise((r) => setImmediate(r));
  assert.equal(w.__sycmMarket.inspect().length, 0);
  await w.fetch(
    "https://sycm.taobao.com/mc/mq/item/rank.json?page=2&pageSize=10&cateId=1&token=secret&_tb_token_=also-secret",
  );
  await new Promise((r) => setImmediate(r));
  const meta = w.__sycmMarket.inspect()[0];
  assert.equal(meta.page_key, "page");
  assert(!JSON.stringify(meta).includes("secret"));
  assert.equal(meta.total, 2);
  assert.equal(meta.sample_count, 1);
});

test("restores credential-free templates after page refresh and renews CSRF token", async () => {
  const first = harness();
  await first.w.fetch(
    "https://sycm.taobao.com/mc/mq/item/rank.json?page=1&dateType=day&dateRange=2020-01-02%7C2020-01-02&token=secret",
  );
  await new Promise((r) => setImmediate(r));
  const saved = first.w.__sycmMarket.inspect();
  assert(!JSON.stringify(saved).includes("secret"));
  assert.deepEqual(Array.from(saved[0].rows_path), ["data", "data"]);
  const second = harness();
  second.w.__sycmMarket.restore(saved);
  const c = second.w.__sycmMarket.inspect()[0];
  const result = await second.w.__sycmMarket.page(
    c.id,
    1,
    c.signature,
    "2020-01-01|2020-01-01",
  );
  assert.equal(result.rows.length, 1);
  const request = new URL(second.requests.at(-1));
  assert.equal(request.searchParams.get("dateRange"), "2020-01-01|2020-01-01");
  assert.equal(request.searchParams.get("dateType"), "day");
  assert.equal(request.searchParams.get("token"), "fresh-token");
});

test("date overrides cannot change endpoint or use a wrong span", async () => {
  const { w, requests } = harness();
  await w.fetch(
    "https://sycm.taobao.com/mc/mq/item/rank.json?page=1&dateType=recent7&dateRange=2020-01-01%7C2020-01-07&cateId=1",
  );
  await new Promise((r) => setImmediate(r));
  const c = w.__sycmMarket.inspect()[0];
  await assert.rejects(() =>
    w.__sycmMarket.page(c.id, 1, c.signature, "2020-02-01|2020-02-01"),
  );
  await assert.rejects(() =>
    w.__sycmMarket.page(c.id, 1, c.signature, "2099-01-01|2099-01-07"),
  );
  await w.__sycmMarket.page(c.id, 2, c.signature, "2020-02-01|2020-02-07");
  const u = new URL(requests.at(-1));
  assert.equal(u.pathname, "/mc/mq/item/rank.json");
  assert.equal(u.searchParams.get("cateId"), "1");
  assert.equal(u.searchParams.get("page"), "2");
});
test("replays only captured endpoint with pagination and immutable filters", async () => {
  const { w, requests } = harness();
  await w.fetch("https://sycm.taobao.com/mc/mq/item/rank.json?page=2&cateId=1");
  await new Promise((r) => setImmediate(r));
  const c = w.__sycmMarket.inspect()[0];
  const data = await w.__sycmMarket.page(c.id, 3, c.signature);
  assert(requests.at(-1).includes("page=3&cateId=1"));
  assert.equal(data.rows.length, 1);
  await assert.rejects(() => w.__sycmMarket.page(c.id, 4, "wrong"));
  await assert.rejects(() => w.__sycmMarket.page(c.id, 0, c.signature));
});
test("keeps zero-based pageIndex after a later capture", async () => {
  const { w, requests } = harness();
  await w.fetch("https://sycm.taobao.com/mc/mq/item/rank.json?pageIndex=0");
  await new Promise((r) => setImmediate(r));
  await w.fetch("https://sycm.taobao.com/mc/mq/item/rank.json?pageIndex=1");
  await new Promise((r) => setImmediate(r));
  const c = w.__sycmMarket.inspect()[0];
  await w.__sycmMarket.page(c.id, 1, c.signature);
  assert(requests.at(-1).includes("pageIndex=0"));
});
test("ignores POST and write-like paths", async () => {
  const { w } = harness();
  await w.fetch("https://sycm.taobao.com/mc/mq/item/rank.json", {
    method: "POST",
  });
  await w.fetch("https://sycm.taobao.com/mc/mq/item/delete/rank.json");
  await new Promise((r) => setImmediate(r));
  assert.equal(w.__sycmMarket.inspect().length, 0);
});

async function capturedDay() {
  const h = harness();
  await h.w.fetch(
    "https://sycm.taobao.com/mc/mq/item/rank.json?page=1&dateType=day&dateRange=2026-10-26%7C2026-10-26",
  );
  await new Promise((r) => setImmediate(r));
  return { ...h, c: h.w.__sycmMarket.inspect()[0] };
}

test("uncaptured old dates are sent unchanged without fallback", async () => {
  const h = await capturedDay();
  await h.w.__sycmMarket.page(
    h.c.id,
    1,
    h.c.signature,
    "2025-01-15|2025-01-15",
  );
  assert.equal(
    new URL(h.requests.at(-1)).searchParams.get("dateRange"),
    "2025-01-15|2025-01-15",
  );
});

test("normal empty rows are returned without guessing permissions or expiration", async () => {
  const h = await capturedDay();
  h.setReply({ body: { success: true, data: { data: [], total: 0 } } });
  const result = await h.w.__sycmMarket.page(
    h.c.id,
    1,
    h.c.signature,
    "2025-01-15|2025-01-15",
  );
  assert.equal(result.rows.length, 0);
  assert.equal(result.total, 0);
});

for (const [message, expected] of [
  ["当前账号无权访问该周期", /明确返回权限不足/],
  ["超出查询范围 仅支持查询最近90天", /超出可查询范围.*最近90天/],
  ["请重新登录", /登录已失效/],
  ["系统繁忙", /未提供明确原因/],
])
  test("platform error classification: " + message, async () => {
    const h = await capturedDay();
    h.setReply({ body: { success: false, code: "FAILED", message } });
    const before = h.requests.length;
    await assert.rejects(
      () =>
        h.w.__sycmMarket.page(
          h.c.id,
          1,
          h.c.signature,
          "2025-01-15|2025-01-15",
        ),
      expected,
    );
    assert.equal(h.requests.length, before + 1);
    assert.equal(
      new URL(h.requests.at(-1)).searchParams.get("dateRange"),
      "2025-01-15|2025-01-15",
    );
    assert.equal(h.w.__sycmMarket.inspect().length, 1);
  });

test("unexplained 403 does not assert login expiration", async () => {
  const h = await capturedDay();
  h.setReply({ status: 403, body: "Forbidden" });
  await assert.rejects(
    () =>
      h.w.__sycmMarket.page(h.c.id, 1, h.c.signature, "2025-01-15|2025-01-15"),
    /403.*未提供明确原因/,
  );
});

test("risk words in a successful product title are not permission errors", async () => {
  const h = await capturedDay();
  h.setReply({
    body: {
      success: true,
      data: { data: [{ itemId: "1", itemTitle: "验证码产品" }], total: 1 },
    },
  });
  const result = await h.w.__sycmMarket.page(
    h.c.id,
    1,
    h.c.signature,
    "2025-01-15|2025-01-15",
  );
  assert.equal(result.rows[0].itemTitle, "验证码产品");
});
