import { test, expect } from "@playwright/test";
import path from "node:path";

test("actual local service renders on desktop and narrow screens", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "市场商品榜", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("正在读取本地工作台")).toBeHidden();
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll("main>div");
    return nodes.length === 1 && getComputedStyle(nodes[0]).opacity === "1";
  });
  await page.screenshot({
    path: path.resolve("../.impeccable/review/desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "连接指南", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: /^采集记录/ }).click();
  await expect(
    page.getByRole("heading", { name: "采集记录", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "连接与设置", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "连接与设置", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "商品榜单", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "市场商品榜", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll("main>div");
    return nodes.length === 1 && getComputedStyle(nodes[0]).opacity === "1";
  });
  await page.screenshot({
    path: path.resolve("../.impeccable/review/mobile.png"),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "连接指南", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(failures).toEqual([]);
});

test("collection controls, search, pagination and cancellation use backend contracts", async ({
  page,
}) => {
  const profile = {
    id: "test-capture",
    signature: "test",
    path: "/mc/item/rank.json",
    params: { cateName: "测试类目", dateRange: "2026-10-19|2026-10-25" },
    captured_at: new Date().toISOString(),
    page_key: "page",
    source_page: "https://sycm.taobao.com/mc/rank",
    sample_count: 20,
    total: 25,
  };
  let task: any = null;
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: any = {};
    if (p === "/api/session") data = { token: "test" };
    else if (p === "/api/setup")
      data = { extension_path: "C:\\test\\extension" };
    else if (p === "/api/connection")
      data = {
        ok: true,
        status: "ready",
        message: "测试连接",
        profiles: [profile],
      };
    else if (p === "/api/tasks" && route.request().method() === "POST")
      data = task = {
        id: "a".repeat(32),
        status: "running",
        profile,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pages: 1,
        total: 25,
        count: 25,
        message: "测试采集",
        missing: [],
      };
    else if (p === "/api/tasks") data = { tasks: task ? [task] : [] };
    else if (p.endsWith("/cancel"))
      data = task = { ...task, status: "cancelled", message: "已取消" };
    else if (p.endsWith("/items")) {
      const url = new URL(route.request().url()),
        n = Number(url.searchParams.get("page"));
      data = {
        items: Array.from({ length: n === 2 ? 5 : 20 }, (_, i) => ({
          item_id: String((n - 1) * 20 + i),
          rank: String((n - 1) * 20 + i + 1),
          title: `测试商品 ${(n - 1) * 20 + i}`,
          shop_name: "测试店铺",
          pay_buyers: "2.5万 ~ 5万",
          visitors: "75万 ~ 100万",
        })),
        total: 25,
      };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "开始采集", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "开始采集", exact: true }).click();
  await expect(page.getByText("测试商品 0", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "导出 Excel" })).toBeDisabled();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByText("测试商品 20", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "停止采集", exact: true }).click();
  await expect(page.getByRole("button", { name: "导出 Excel" })).toBeEnabled();
  await page.getByRole("textbox", { name: "搜索已采集商品" }).fill("测试");
  await expect(page.getByText("测试商品 0", { exact: true })).toBeVisible();
});
