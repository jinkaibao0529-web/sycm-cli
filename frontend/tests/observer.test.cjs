const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");

function harness() {
  class XHR {
    open() {}
    send() {}
  }
  const requests = [];
  const response = (rows, total = 2) => ({
    status: 200,
    ok: true,
    url: "https://sycm.taobao.com/mc/mq/item/rank.json",
    clone() {
      return this;
    },
    json: async () => ({ data: { data: rows, total } }),
    text: async () => JSON.stringify({ data: { data: rows, total } }),
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
  return { w, requests };
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
