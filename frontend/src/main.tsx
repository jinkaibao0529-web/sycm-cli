import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePause,
  CircleX,
  Clock3,
  Database,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  History,
  Link2,
  ListFilter,
  LoaderCircle,
  Monitor,
  PackageSearch,
  Play,
  Plug,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Table2,
  X,
  ChartNoAxesCombined,
  Copy,
  MousePointer2,
} from "lucide-react";
import {
  api,
  initSession,
  activeTask,
  statusLabel,
  dateLabel,
  categoryLabel,
  type Connection,
  type Item,
  type Profile,
  type Task,
  type PeriodChoice,
  periodLabels,
} from "./api";
import { Button } from "./components/ui/button";
import { PeriodPicker } from "./components/period-picker";
import "./styles.css";

type View = "rank" | "history" | "settings";
const initialConnection: Connection = {
  ok: false,
  status: "idle",
  message: "尚未检查浏览器连接",
  profiles: [],
};
const niceTime = (text: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(text));
const safeLink = (value: string | null) =>
  value?.startsWith("https://") ? value : undefined;
const paramLabels: Record<string, string> = {
  cateId: "类目",
  cateName: "类目名称",
  categoryId: "类目",
  dateRange: "统计周期",
  dateType: "周期类型",
  shopType: "店铺类型",
  sellerType: "店铺类型",
  rankType: "榜单类型",
  priceRange: "价格带",
  price: "价格带",
  keyword: "商品关键词",
  pageSize: "每页条数",
  device: "终端",
  orderBy: "排序指标",
};

function App() {
  const [view, setView] = useState<View>("rank");
  const [connection, setConnection] = useState<Connection>(initialConnection);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState("");
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [extensionPath, setExtensionPath] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const selected = tasks.find((t) => t.id === selectedId) || null;
  const running = tasks.find((t) => activeTask(t));
  const profile =
    connection.profiles.find((p) => p.id === profileId) ||
    connection.profiles[0];
  const reduced = useReducedMotion();
  const fade = {
    initial: { opacity: 0, y: reduced ? 0 : 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduced ? 0 : -4 },
    transition: { duration: reduced ? 0.01 : 0.2 },
  };
  const notify = (text: string, error = false) => setToast({ text, error });

  const refresh = useCallback(async () => {
    const [c, t] = await Promise.all([
      api<Connection>("/connection"),
      api<{ tasks: Task[] }>("/tasks"),
    ]);
    setConnection(c);
    setTasks(t.tasks);
    setProfileId((previous) =>
      c.profiles.some((p) => p.id === previous)
        ? previous
        : c.profiles[0]?.id || "",
    );
    setSelectedId((previous) => previous || t.tasks[0]?.id || null);
  }, []);
  useEffect(() => {
    let mounted = true;
    initSession()
      .then(() =>
        Promise.all([
          refresh(),
          api<{ extension_path: string }>("/setup").then((s) => {
            if (mounted) setExtensionPath(s.extension_path);
          }),
        ]),
      )
      .catch((e) => notify(e.message, true))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [loading, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!selectedId) {
      setItems([]);
      setItemTotal(0);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        api<{ items: Item[]; total: number }>(
          `/tasks/${selectedId}/items?page=${page}&q=${encodeURIComponent(query)}`,
        )
          .then((data) => {
            if (!controller.signal.aborted) {
              setItems(data.items);
              setItemTotal(data.total);
            }
          })
          .catch((e) => {
            if (!controller.signal.aborted) notify(e.message, true);
          });
      },
      query ? 200 : 0,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [selectedId, page, query, selected?.count, selected?.status]);

  async function checkConnection() {
    setBusy(true);
    try {
      setConnection(await api<Connection>("/connection/check", "POST"));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!profile || !periodChoice) return;
    setBusy(true);
    try {
      const task = await api<Task>("/tasks", "POST", {
        profile_id: profile.id,
        ...periodChoice,
      });
      setTasks((p) => [task, ...p]);
      setSelectedId(task.id);
      setPage(1);
      setQuery("");
      notify("已开始采集 请保持市场榜单标签页打开");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!running) return;
    try {
      await api(`/tasks/${running.id}/cancel`, "POST");
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  function openTask(task: Task) {
    setSelectedId(task.id);
    setPage(1);
    setQuery("");
    setView("rank");
  }
  async function copyPath() {
    try {
      await navigator.clipboard.writeText(extensionPath);
      notify("扩展目录已复制");
    } catch {
      notify("请手动复制下方扩展路径", true);
    }
  }
  function download(task: Task) {
    window.location.assign(`/api/tasks/${task.id}/export`);
    notify(
      task.status === "completed"
        ? "正在导出 Excel"
        : "正在导出已完成部分 文件会注明任务未完成",
    );
  }
  const checking = connection.status === "checking";
  const connected = connection.ok;

  const SetupContent = () => (
    <div className="setup-content">
      <div className="setup-intro">
        <Plug size={24} />
        <div>
          <h3>连接你已登录的浏览器</h3>
          <p>扩展在生意参谋页面内读取数据 结果只保存在这台电脑</p>
        </div>
      </div>
      <ol className="setup-steps">
        <li>
          <strong>加载取数桥扩展</strong>
          <p>
            在 Chrome 打开 <code>chrome://extensions</code> 开启开发者模式
            选择加载已解压的扩展程序
          </p>
          <div className="path-box">
            <code>{extensionPath || "正在读取扩展目录"}</code>
            <Button
              variant="ghost"
              size="icon"
              onClick={copyPath}
              aria-label="复制扩展路径"
            >
              <Copy size={16} />
            </Button>
          </div>
          <p>选择直接包含 manifest.json 的文件夹 不要进入 icons 子文件夹</p>
        </li>
        <li>
          <strong>打开市场商品榜</strong>
          <p>登录生意参谋 进入市场排行的商品页 设置类目 日期 榜单和价格带</p>
          <a
            href="https://sycm.taobao.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-link"
          >
            打开生意参谋
            <ArrowUpRight size={14} />
          </a>
        </li>
        <li>
          <strong>刷新页面并翻页一次</strong>
          <p>让扩展识别当前筛选条件和分页请求 然后回到这里点击识别榜单</p>
        </li>
      </ol>
      <div className="setup-footer">
        <span>
          <ShieldCheck size={15} />
          不需要 Agent 或模型密钥
        </span>
        <Button
          onClick={() => {
            setSetupOpen(false);
            checkConnection();
          }}
          disabled={checking || !!running}
        >
          <RefreshCw size={15} />
          识别榜单
        </Button>
      </div>
    </div>
  );

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
    >
      <LayoutGroup>
        <div className="app-shell">
          <aside className="sidebar">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setView("rank");
              }}
            >
              <span className="brand-symbol">
                <ChartNoAxesCombined size={22} />
              </span>
              <span>
                市场观察<span className="brand-sub">本地数据工作台</span>
              </span>
            </a>
            <nav aria-label="主要导航">
              {(
                [
                  { id: "rank", icon: Table2, label: "商品榜单" },
                  { id: "history", icon: History, label: "采集记录" },
                  { id: "settings", icon: Settings2, label: "连接与设置" },
                ] as const
              ).map((n) => (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={`nav-item ${view === n.id ? "selected" : ""}`}
                  aria-label={n.label}
                  aria-current={view === n.id ? "page" : undefined}
                >
                  {view === n.id && (
                    <motion.span
                      layoutId="nav-highlight"
                      className="nav-highlight"
                    />
                  )}
                  <n.icon size={18} />
                  <span>{n.label}</span>
                  {n.id === "history" && tasks.length > 0 && (
                    <span className="nav-count">{tasks.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="local-note">
                <Monitor size={17} />
                <div>
                  本机运行<span>数据保存在你的电脑</span>
                </div>
              </div>
              <button className="help-link" onClick={() => setSetupOpen(true)}>
                <CircleHelp size={16} />
                使用指南
                <ArrowUpRight size={14} />
              </button>
              <div className="version">
                基于 sycm-cli<span>v0.2.1</span>
              </div>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <div className="breadcrumb">
                工作台
                <ChevronRight size={14} />
                <span>
                  {view === "rank"
                    ? "商品榜单"
                    : view === "history"
                      ? "采集记录"
                      : "连接与设置"}
                </span>
              </div>
              <div className="topbar-right">
                <span className="local-badge">
                  <ShieldCheck size={14} />
                  仅本地访问
                </span>
                <span className="topbar-divider" />
                <button
                  className="topbar-help"
                  onClick={() => setSetupOpen(true)}
                  aria-label="打开使用指南"
                >
                  <CircleHelp size={18} />
                </button>
              </div>
            </header>
            <main>
              <AnimatePresence mode="wait" initial={false}>
                {view === "rank" ? (
                  <motion.div key="rank" {...fade}>
                    <div className="page-heading">
                      <div>
                        <h1>市场商品榜</h1>
                        <p>看清榜单变化 把有价值的数据留在本地</p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={!selected?.count || activeTask(selected)}
                        onClick={() => selected && download(selected)}
                      >
                        <ArrowDownToLine size={16} />
                        导出 Excel
                      </Button>
                    </div>
                    <motion.section
                      layout
                      className={`connection-strip ${connected ? "is-connected" : ""}`}
                      aria-label="浏览器连接状态"
                    >
                      <div className="connection-icon">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={
                              checking
                                ? "checking"
                                : connected
                                  ? "connected"
                                  : "idle"
                            }
                            className="connection-icon-stage"
                            initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: reduced ? 1 : 0.95 }}
                            transition={{ duration: reduced ? 0 : 0.12 }}
                          >
                            {checking ? (
                              <LoaderCircle size={19} className="spin" />
                            ) : connected ? (
                              <Link2 size={19} />
                            ) : (
                              <Plug size={19} />
                            )}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                      <div className="connection-copy">
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.div
                            key={connection.status}
                            className="connection-copy-stage"
                            initial={{ opacity: 0, y: reduced ? 0 : 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: reduced ? 0 : -3 }}
                            transition={{ duration: reduced ? 0 : 0.12 }}
                          >
                            <strong>
                              {checking
                                ? "正在连接浏览器"
                                : connection.status === "ready"
                                  ? "市场榜单已就绪"
                                  : connected
                                    ? "浏览器已连接"
                                    : "连接生意参谋 开始读取榜单"}
                            </strong>
                            <span>
                              {connection.status === "idle"
                                ? "使用你在 Chrome 中的登录状态 无需提供账号密码"
                                : connection.message}
                            </span>
                          </motion.div>
                        </AnimatePresence>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSetupOpen(true)}
                      >
                        连接指南
                        <ArrowUpRight size={14} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={checkConnection}
                        disabled={checking || busy || !!running}
                      >
                        <RefreshCw
                          size={14}
                          className={checking ? "spin" : ""}
                        />
                        {checking ? "识别中" : "识别榜单"}
                      </Button>
                    </motion.section>
                    <motion.section
                      layout
                      className="source-panel"
                      aria-label="采集条件"
                    >
                      <div className="section-line">
                        <h2>
                          <SlidersHorizontal size={17} />
                          采集条件
                        </h2>
                        <button
                          className="text-button"
                          onClick={() => setShowDetails((p) => !p)}
                          aria-expanded={showDetails}
                        >
                          {showDetails ? "收起来源" : "查看来源"}
                          <ChevronDown
                            size={14}
                            className={showDetails ? "rotate" : ""}
                          />
                        </button>
                      </div>
                      <PeriodPicker
                        profile={profile}
                        disabled={checking || busy}
                        onChange={setPeriodChoice}
                      />
                      <div className="filter-grid">
                        <label className="field source-field">
                          <span>榜单来源</span>
                          <div className="select-wrap">
                            <select
                              aria-label="榜单来源"
                              value={profile?.id || ""}
                              disabled={
                                !connection.profiles.length || !!running
                              }
                              onChange={(e) => setProfileId(e.target.value)}
                            >
                              {!connection.profiles.length && (
                                <option value="">等待识别市场商品榜</option>
                              )}
                              {connection.profiles.map((p, i) => (
                                <option key={p.id} value={p.id}>
                                  {categoryLabel(p)} ·{" "}
                                  {p.params.rankType === "gmv"
                                    ? "交易总量榜"
                                    : "已识别榜单"}
                                  {connection.profiles.length > 1
                                    ? ` · 条件组 ${i + 1}`
                                    : ""}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={14} />
                          </div>
                        </label>
                        <div className="field">
                          <span>统计周期</span>
                          <div className="field-value">
                            {periodChoice
                              ? `${periodLabels[periodChoice.period_mode]} ${periodChoice.anchor_date || "最新统计窗口"}`
                              : profile
                                ? dateLabel(profile)
                                : "尚未识别"}
                          </div>
                        </div>
                        <div className="field">
                          <span>采集范围</span>
                          <div className="field-value">
                            <Check size={14} />
                            当前筛选全部可访问页
                          </div>
                        </div>
                        <Button
                          onClick={start}
                          disabled={
                            !profile ||
                            !periodChoice ||
                            checking ||
                            busy ||
                            !!running
                          }
                        >
                          {busy ? (
                            <LoaderCircle size={15} className="spin" />
                          ) : (
                            <Play size={15} />
                          )}
                          开始采集
                        </Button>
                      </div>
                      <div className="sync-note">
                        <Link2 size={13} />
                        <span>
                          类目与榜单条件来自生意参谋 时间周期在本地切换
                          未识别的入口需在原页面打开一次
                        </span>
                      </div>
                      <AnimatePresence initial={false}>
                        {showDetails && (
                          <motion.div
                            className="source-details"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                          >
                            <div>
                              {profile ? (
                                <>
                                  <p>
                                    当前数据来源{" "}
                                    <span>{profile.source_page}</span>
                                  </p>
                                  <div className="param-list">
                                    {Object.entries(profile.params)
                                      .filter(
                                        ([k]) =>
                                          paramLabels[k] &&
                                          !["dateRange", "dateType"].includes(
                                            k,
                                          ),
                                      )
                                      .map(([k, v]) => (
                                        <span key={k}>
                                          {paramLabels[k]} <b>{v}</b>
                                        </span>
                                      ))}
                                  </div>
                                  <p>
                                    识别时间 {niceTime(profile.captured_at)} ·{" "}
                                    {profile.page_key
                                      ? "已识别分页参数"
                                      : "分页待验证"}{" "}
                                    · 首批 {profile.sample_count} 件商品
                                  </p>
                                </>
                              ) : (
                                <p>
                                  连接后显示原页面的真实筛选条件
                                  不会自动填充示例数据
                                </p>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.section>
                    <AnimatePresence initial={false}>
                      {selected && (
                        <motion.section
                          layout
                          {...fade}
                          className={`task-strip ${selected.status === "failed" ? "task-error" : ""}`}
                          aria-live="polite"
                        >
                          <span
                            className={`task-symbol ${activeTask(selected) ? "is-active" : ""}`}
                          >
                            {activeTask(selected) ? (
                              <LoaderCircle size={19} className="spin" />
                            ) : selected.status === "completed" ? (
                              <CheckCheck size={19} />
                            ) : (
                              <CirclePause size={19} />
                            )}
                          </span>
                          <div className="task-info">
                            <div>
                              <strong>
                                {statusLabel[selected.status] ||
                                  selected.status}
                              </strong>
                              <span>
                                {selected.count} 件商品
                                <span className="dot-divider">·</span>
                                {selected.pages} 页
                              </span>
                            </div>
                            <p>{selected.message}</p>
                          </div>
                          {activeTask(selected) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={cancel}
                              disabled={selected.status === "cancelling"}
                            >
                              <Square size={12} />
                              停止采集
                            </Button>
                          ) : (
                            <span className="task-time">
                              {niceTime(selected.updated_at)}
                            </span>
                          )}
                          {activeTask(selected) && (
                            <div className="task-progress">
                              <motion.div
                                initial={{ width: "3%" }}
                                animate={{
                                  width: selected.total
                                    ? `${Math.min(98, Math.max(3, (selected.count / selected.total) * 100))}%`
                                    : "25%",
                                }}
                              />
                            </div>
                          )}
                        </motion.section>
                      )}
                    </AnimatePresence>
                    <section className="results-panel">
                      <div className="results-heading">
                        <div>
                          <h2>
                            商品明细
                            {selected && (
                              <span className="number-badge">
                                {selected.count}
                              </span>
                            )}
                          </h2>
                          <p>
                            {selected
                              ? `${dateLabel(selected.profile)} · ${niceTime(selected.created_at)} 采集 · ${selected.profile.period?.kind || "区间数据保留平台原文"}`
                              : "连接后读取真实榜单 支持预览和 Excel 导出"}
                          </p>
                        </div>
                        <label className="search-field">
                          <Search size={15} />
                          <input
                            aria-label="搜索已采集商品"
                            placeholder="搜索商品或店铺"
                            value={query}
                            disabled={!selected?.count}
                            onChange={(e) => {
                              setQuery(e.target.value);
                              setPage(1);
                            }}
                          />
                          {query && (
                            <button
                              aria-label="清空搜索"
                              onClick={() => setQuery("")}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </label>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th className="rank-col">排名</th>
                              <th className="product-col">商品</th>
                              <th>店铺</th>
                              <th>商品关键词</th>
                              <th className="number-col">
                                支付买家数
                                <CircleHelp
                                  size={12}
                                  aria-label="保留平台返回的区间数值"
                                />
                              </th>
                              <th className="number-col">访客数</th>
                              <th className="link-col">
                                <span className="sr-only">查看商品</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <AnimatePresence initial={false}>
                              {items.map((item, i) => (
                                <motion.tr
                                  layout="position"
                                  key={`${selectedId}:${item.item_id || item.product_url || i}`}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0, y: reduced ? 0 : -3 }}
                                  transition={{ duration: reduced ? 0 : 0.16 }}
                                >
                                  <td>
                                    <span
                                      className={`rank-value ${Number(item.rank) <= 3 ? "top-rank" : ""}`}
                                    >
                                      {item.rank || "—"}
                                    </span>
                                    <small className="rank-change">
                                      {item.rank_change || ""}
                                    </small>
                                  </td>
                                  <td>
                                    <div className="product-cell">
                                      {safeLink(item.image_url) ? (
                                        <img
                                          src={item.image_url!}
                                          alt=""
                                          loading="lazy"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => {
                                            e.currentTarget.style.visibility =
                                              "hidden";
                                          }}
                                        />
                                      ) : (
                                        <span className="product-placeholder">
                                          <PackageSearch size={20} />
                                        </span>
                                      )}
                                      <div>
                                        <span
                                          className="product-title"
                                          title={item.title || undefined}
                                        >
                                          {item.title || "商品名称未返回"}
                                        </span>
                                        <small>
                                          {item.item_id || "商品 ID 未返回"}
                                        </small>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="shop-name">
                                      {item.shop_name || "—"}
                                    </span>
                                    <small className="shop-type">
                                      {item.shop_type || ""}
                                    </small>
                                  </td>
                                  <td>
                                    <span className="keywords">
                                      {item.keywords || "—"}
                                    </span>
                                  </td>
                                  <td className="number-cell">
                                    {item.pay_buyers || "—"}
                                  </td>
                                  <td className="number-cell">
                                    {item.visitors || "—"}
                                  </td>
                                  <td>
                                    {safeLink(item.product_url) && (
                                      <a
                                        href={item.product_url!}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="row-link"
                                        aria-label={`查看商品 ${item.title || item.item_id}`}
                                      >
                                        <ArrowUpRight size={16} />
                                      </a>
                                    )}
                                  </td>
                                </motion.tr>
                              ))}
                            </AnimatePresence>
                          </tbody>
                        </table>
                      </div>
                      <AnimatePresence mode="wait" initial={false}>
                        {!items.length && (
                          <motion.div
                            key={
                              loading
                                ? "loading"
                                : selected?.count
                                  ? "no-match"
                                  : "empty"
                            }
                            {...fade}
                            className="empty-state"
                          >
                            {loading ? (
                              <>
                                <LoaderCircle size={30} className="spin" />
                                <h3>正在读取本地工作台</h3>
                              </>
                            ) : selected?.count ? (
                              <>
                                <Search size={30} />
                                <h3>没有匹配的商品</h3>
                                <p>试试其他商品名称或店铺关键词</p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setQuery("")}
                                >
                                  清空搜索
                                </Button>
                              </>
                            ) : (
                              <>
                                <div className="empty-visual">
                                  <span className="empty-line line-one" />
                                  <span className="empty-line line-two" />
                                  <span className="empty-icon">
                                    <PackageSearch size={30} />
                                  </span>
                                  <span className="empty-line line-three" />
                                </div>
                                <h3>
                                  {activeTask(selected)
                                    ? "正在读取第一批商品"
                                    : selected?.status === "completed"
                                      ? "该周期未返回商品数据"
                                      : "你的下一份市场榜单 从这里开始"}
                                </h3>
                                <p>
                                  {activeTask(selected)
                                    ? "取数桥正在连接浏览器 数据返回后会出现在这里"
                                    : selected?.status === "completed"
                                      ? "可以切换其他日期或时间入口重新采集"
                                      : "先连接生意参谋 识别当前榜单 再一键采集全部页"}
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSetupOpen(true)}
                                >
                                  <BookOpen size={15} />
                                  查看连接步骤
                                  <ArrowRight size={14} />
                                </Button>
                              </>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div className="table-footer">
                        <span>
                          <Database size={13} />
                          {selected
                            ? `已存 ${selected.count} 件`
                            : "暂无采集数据"}
                          <span className="dot-divider">·</span>仅保存在本机
                        </span>
                        <div className="pagination">
                          <span>
                            {itemTotal
                              ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, itemTotal)} / ${itemTotal}`
                              : "0 条"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="上一页"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                          >
                            <ChevronRight className="flip" size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="下一页"
                            disabled={page * 20 >= itemTotal}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            <ChevronRight size={16} />
                          </Button>
                        </div>
                      </div>
                    </section>
                    <footer className="page-footer">
                      <ShieldCheck size={13} />
                      <span>原始区间如实保留 缺失字段留空 不推算精确销量</span>
                      <span className="footer-end">
                        数据来自你有权限访问的生意参谋页面
                      </span>
                    </footer>
                  </motion.div>
                ) : view === "history" ? (
                  <motion.div key="history" {...fade}>
                    <div className="page-heading">
                      <div>
                        <h1>采集记录</h1>
                        <p>每一次采集都有迹可循 随时预览或再次导出</p>
                      </div>
                      <Button variant="outline" onClick={() => setView("rank")}>
                        <Table2 size={16} />
                        返回榜单
                      </Button>
                    </div>
                    <section className="history-panel">
                      <div className="history-summary">
                        <History size={17} />
                        <strong>最近的采集</strong>
                        <span>{tasks.length} 个任务</span>
                      </div>
                      {tasks.length ? (
                        tasks.map((task) => (
                          <motion.div
                            layout
                            key={task.id}
                            className="history-row"
                          >
                            <span
                              className={`history-symbol ${task.status === "completed" ? "done" : ""}`}
                            >
                              {task.status === "completed" ? (
                                <FileSpreadsheet size={21} />
                              ) : (
                                <Clock3 size={21} />
                              )}
                            </span>
                            <div className="history-copy">
                              <strong>{categoryLabel(task.profile)}</strong>
                              <p>
                                {dateLabel(task.profile)}
                                <span className="dot-divider">·</span>
                                {niceTime(task.created_at)}
                              </p>
                            </div>
                            <span
                              className={`status-pill ${task.status === "completed" ? "done" : ""}`}
                            >
                              {statusLabel[task.status]}
                            </span>
                            <span className="history-count">
                              {task.count} 件<span>{task.pages} 页</span>
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openTask(task)}
                            >
                              预览
                              <ArrowRight size={14} />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`导出任务 ${task.id.slice(0, 6)}`}
                              disabled={!task.count || activeTask(task)}
                              onClick={() => download(task)}
                            >
                              <ArrowDownToLine size={15} />
                              导出
                            </Button>
                          </motion.div>
                        ))
                      ) : (
                        <div className="empty-state">
                          <History size={32} />
                          <h3>还没有采集记录</h3>
                          <p>完成第一次榜单采集后 任务会保存在这里</p>
                          <Button onClick={() => setView("rank")}>
                            前往商品榜单
                            <ArrowRight size={15} />
                          </Button>
                        </div>
                      )}
                    </section>
                  </motion.div>
                ) : (
                  <motion.div key="settings" {...fade}>
                    <div className="page-heading">
                      <div>
                        <h1>连接与设置</h1>
                        <p>一次连接 随时在本地读取你有权限访问的数据</p>
                      </div>
                      <span className="local-badge">
                        <Monitor size={15} />
                        Windows 本地版
                      </span>
                    </div>
                    <section className="settings-panel">
                      <SetupContent />
                    </section>
                    <section className="privacy-notes">
                      <ShieldCheck size={20} />
                      <div>
                        <h3>你的数据 留在你的电脑</h3>
                        <p>
                          工具只监听本机地址 不接入云端或模型服务
                          登录和平台验证始终在生意参谋完成
                        </p>
                        <p>
                          同一时间只执行一个采集任务
                          请在采集期间保持原标签页打开 不切换账号
                        </p>
                      </div>
                    </section>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </div>
          <Dialog.Root open={setupOpen} onOpenChange={setSetupOpen}>
            <AnimatePresence>
              {setupOpen && (
                <Dialog.Portal forceMount>
                  <Dialog.Overlay asChild>
                    <motion.div
                      className="dialog-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                  </Dialog.Overlay>
                  <Dialog.Content asChild>
                    <motion.div
                      className="dialog-content"
                      initial={{
                        opacity: 0,
                        y: reduced ? 0 : 14,
                        scale: reduced ? 1 : 0.98,
                      }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{
                        opacity: 0,
                        y: reduced ? 0 : 8,
                        scale: reduced ? 1 : 0.99,
                      }}
                    >
                      <div className="dialog-title">
                        <Dialog.Title>连接指南</Dialog.Title>
                        <Dialog.Close asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="关闭连接指南"
                          >
                            <X size={18} />
                          </Button>
                        </Dialog.Close>
                      </div>
                      <Dialog.Description className="sr-only">
                        安装取数桥扩展 登录生意参谋 然后识别市场商品榜
                      </Dialog.Description>
                      <SetupContent />
                    </motion.div>
                  </Dialog.Content>
                </Dialog.Portal>
              )}
            </AnimatePresence>
          </Dialog.Root>
          <AnimatePresence>
            {toast && (
              <motion.div
                role={toast.error ? "alert" : "status"}
                className={`toast ${toast.error ? "toast-error" : ""}`}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5 }}
              >
                {toast.error ? <CircleX size={18} /> : <Check size={18} />}
                <span>{toast.text}</span>
                <button onClick={() => setToast(null)} aria-label="关闭提示">
                  <X size={15} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
