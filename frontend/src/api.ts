export type Profile = {
  id: string;
  signature: string;
  path: string;
  params: Record<string, string>;
  captured_at: string;
  page_key: string | null;
  source_page: string;
  sample_count: number;
  total: number | null;
  period?: {
    mode: string;
    label: string;
    start_date: string;
    end_date: string;
    kind: string;
  };
};
export const periodLabels = {
  realtime: "实时",
  recent7: "7天",
  recent30: "30天",
  day: "日",
  week: "周",
  month: "月",
};
export type PeriodChoice = {
  period_mode: keyof typeof periodLabels;
  anchor_date?: string;
};
export type PeriodOption = {
  mode: keyof typeof periodLabels;
  label: string;
  available: boolean;
  message: string;
  min_anchor?: string | null;
  max_anchor?: string;
  anchor_date?: string;
  start_date?: string;
  end_date?: string;
};
export type Connection = {
  ok: boolean;
  status: "idle" | "checking" | "ready" | "connected" | "offline";
  message: string;
  profiles: Profile[];
};
export type Task = {
  id: string;
  status: string;
  profile: Profile;
  created_at: string;
  updated_at: string;
  pages: number;
  total: number | null;
  count: number;
  message: string;
  missing: string[];
};
export type Item = Record<
  | "rank"
  | "rank_change"
  | "item_id"
  | "title"
  | "keywords"
  | "shop_name"
  | "shop_type"
  | "pay_buyers"
  | "visitors"
  | "product_url"
  | "image_url",
  string | null
>;
let token = "";
export async function initSession() {
  token = (await api<{ token: string }>("/session")).token;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Market-Token": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = "本地服务暂不可用 请稍后重试";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
export const activeTask = (task?: Task | null) =>
  !!task && ["queued", "running", "cancelling"].includes(task.status);
export const statusLabel: Record<string, string> = {
  queued: "等待连接",
  running: "采集中",
  cancelling: "正在停止",
  completed: "采集完成",
  failed: "采集未完成",
  cancelled: "已取消",
  interrupted: "已中断",
};
export const dateLabel = (profile?: Profile) =>
  `${profile?.period?.label || periodLabels[(profile?.params.dateType === "today" ? "realtime" : profile?.params.dateType) as keyof typeof periodLabels] || ""} ${
    profile?.params.dateRange?.replace("|", " 至 ") ||
    (profile?.params.startDate
      ? `${profile.params.startDate} 至 ${profile.params.endDate || profile.params.startDate}`
      : "与生意参谋当前周期一致")
  }`.trim();
export const categoryLabel = (profile?: Profile) =>
  profile?.params.cateName ||
  profile?.params.categoryName ||
  (profile?.params.cateId
    ? `已选类目 ${profile.params.cateId}`
    : "生意参谋当前类目");
