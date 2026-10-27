import { test, expect } from "@playwright/test";

test("all period controls submit fixed requests and enforce date boundaries", async ({
  page,
}) => {
  const labels = {
    realtime: "实时",
    recent7: "7天",
    recent30: "30天",
    day: "日",
    week: "周",
    month: "月",
  };
  const dates = {
    realtime: ["2026-10-27", "2026-10-27"],
    recent7: ["2026-10-20", "2026-10-20"],
    recent30: ["2026-09-27", "2026-09-27"],
    day: ["2026-10-14", "2026-10-26"],
    week: ["2026-10-12", "2026-10-19"],
    month: ["2026-07-01", "2026-09-01"],
  };
  const profile = {
    id: "period-source",
    signature: "observed",
    path: "/mc/mq/mkt/item/offline/rank.json",
    params: {
      cateId: "test",
      dateType: "recent7",
      dateRange: "2026-10-20|2026-10-26",
    },
    captured_at: new Date().toISOString(),
    page_key: "page",
    source_page: "https://sycm.taobao.com/mc/free/market_rank",
    sample_count: 10,
    total: 300,
  };
  let posted: any = null,
    task: any = null;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let value: any = {};
    if (path === "/api/session") value = { token: "test" };
    else if (path === "/api/setup") value = { extension_path: "C:\\test" };
    else if (path === "/api/connection")
      value = {
        ok: true,
        status: "ready",
        message: "测试",
        profiles: [profile],
      };
    else if (path === "/api/periods")
      value = {
        periods: Object.entries(labels).map(([mode, label]) => ({
          mode,
          label,
          available: true,
          message: "",
          min_anchor: null,
          max_anchor: dates[mode as keyof typeof dates][1],
          anchor_date: dates[mode as keyof typeof dates][1],
        })),
      };
    else if (path === "/api/tasks" && route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      value = task = {
        id: "b".repeat(32),
        status: "running",
        profile: {
          ...profile,
          period: {
            mode: posted.period_mode,
            label: "月",
            start_date: posted.anchor_date,
            end_date: "2025-01-31",
            kind: "历史周期统计",
          },
          params: {
            ...profile.params,
            dateType: "month",
            dateRange: "2025-01-01|2025-01-31",
          },
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        count: 0,
        pages: 0,
        message: "测试任务",
        missing: [],
      };
    } else if (path === "/api/tasks") value = { tasks: task ? [task] : [] };
    else if (path.endsWith("/items")) value = { items: [], total: 0 };
    await route.fulfill({ json: value });
  });
  await page.goto("/");
  const group = page.getByRole("group", { name: "统计时间入口" });
  for (const label of Object.values(labels))
    await expect(
      group.getByRole("button", { name: label, exact: true }),
    ).toBeEnabled();
  await group.getByRole("button", { name: "实时", exact: true }).click();
  await expect(page.getByText("单次快照 不自动刷新")).toBeVisible();
  await group.getByRole("button", { name: "日", exact: true }).click();
  await expect(page.getByLabel("日统计日期")).toHaveValue("2026-10-26");
  await expect(page.getByRole("button", { name: "下一周期" })).toBeDisabled();
  await page.getByRole("button", { name: "上一周期" }).click();
  await expect(page.getByLabel("日统计日期")).toHaveValue("2026-10-25");
  await expect(page.getByLabel("日统计日期")).not.toHaveAttribute("min");
  await page.getByLabel("日统计日期").fill("2025-01-15");
  await expect(
    page.getByRole("button", { name: "开始采集", exact: true }),
  ).toBeEnabled();
  await group.getByRole("button", { name: "周", exact: true }).click();
  await expect(page.getByLabel("周统计日期")).toHaveValue("2026-W43");
  await page.getByRole("button", { name: "上一周期" }).click();
  await expect(page.getByLabel("周统计日期")).toHaveValue("2026-W42");
  await expect(page.getByRole("button", { name: "上一周期" })).toBeEnabled();
  await page.getByRole("button", { name: "上一周期" }).click();
  await expect(page.getByLabel("周统计日期")).toHaveValue("2026-W41");
  await group.getByRole("button", { name: "月", exact: true }).click();
  await page.getByRole("button", { name: "上一周期" }).click();
  await expect(page.getByLabel("月统计日期")).toHaveValue("2026-08");
  await page.getByLabel("月统计日期").fill("");
  await expect(page.getByLabel("月统计日期")).toHaveValue("");
  await expect(page.getByRole("button", { name: "上一周期" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下一周期" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "开始采集", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("月统计日期").fill("2025-01");
  await page.getByRole("button", { name: "开始采集", exact: true }).click();
  expect(posted).toEqual({
    profile_id: "period-source",
    period_mode: "month",
    anchor_date: "2025-01-01",
  });
  await group.getByRole("button", { name: "7天", exact: true }).click();
  await expect(
    page.getByText("月 2025-01-01 至 2025-01-31", { exact: false }).first(),
  ).toBeVisible();
  expect(task.profile.period.mode).toBe("month");
});
