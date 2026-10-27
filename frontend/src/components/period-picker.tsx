import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import {
  api,
  type Profile,
  type PeriodChoice,
  type PeriodOption,
  periodLabels,
} from "../api";
import { Button } from "./ui/button";

export function weekValue(value: string) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const year = date.getUTCFullYear();
  const week = Math.ceil(
    ((date.getTime() -
      Date.parse(`${String(year).padStart(4, "0")}-01-01T00:00:00Z`)) /
      86400000 +
      1) /
      7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function fromWeek(value: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return "";
  const date = new Date(`${match[1]}-01-04T00:00:00Z`);
  date.setUTCDate(
    date.getUTCDate() -
      ((date.getUTCDay() || 7) - 1) +
      (Number(match[2]) - 1) * 7,
  );
  return date.toISOString().slice(0, 10);
}
export function PeriodPicker({
  profile,
  disabled,
  onChange,
}: {
  profile?: Profile;
  disabled: boolean;
  onChange: (value: PeriodChoice | null) => void;
}) {
  const [options, setOptions] = useState<PeriodOption[]>([]);
  const [mode, setMode] = useState<PeriodChoice["period_mode"]>("recent7");
  const [anchor, setAnchor] = useState("");
  const [message, setMessage] = useState("识别榜单后可选择统计时间");
  const current = options.find((p) => p.mode === mode);
  const historical = ["day", "week", "month"].includes(mode);
  useEffect(() => {
    let alive = true;
    setOptions([]);
    onChange(null);
    if (!profile) {
      setMessage("识别榜单后可选择统计时间");
      return;
    }
    setMessage("正在读取已识别的时间入口");
    api<{ periods: PeriodOption[] }>(
      `/periods?profile_id=${encodeURIComponent(profile.id)}`,
    )
      .then((data) => {
        if (!alive) return;
        const periods = data.periods || [];
        setOptions(periods);
        const native =
          profile.params.dateType === "today"
            ? "realtime"
            : profile.params.dateType;
        const first =
          periods.find((p) => p.mode === native && p.available) ||
          periods.find((p) => p.available);
        if (first) {
          setMode(first.mode);
          setAnchor(first.anchor_date || "");
          onChange({
            period_mode: first.mode,
            ...(["day", "week", "month"].includes(first.mode)
              ? { anchor_date: first.anchor_date }
              : {}),
          });
          setMessage("");
        } else setMessage("尚未识别可用周期 请先在生意参谋切换对应入口");
      })
      .catch((error) => {
        if (alive) setMessage(error.message);
      });
    return () => {
      alive = false;
    };
  }, [profile?.id, onChange]);
  function choose(option: PeriodOption) {
    setMode(option.mode);
    setAnchor(option.anchor_date || "");
    setMessage("");
    onChange({
      period_mode: option.mode,
      ...(["day", "week", "month"].includes(option.mode)
        ? { anchor_date: option.anchor_date }
        : {}),
    });
  }
  function changeDate(next: string) {
    setAnchor(next);
    if (!next || !current || !Number.isFinite(Date.parse(next))) {
      setMessage("请选择有效日期");
      onChange(null);
      return;
    }
    if (
      (current.min_anchor && next < current.min_anchor) ||
      (current.max_anchor && next > current.max_anchor)
    ) {
      setMessage(
        current.min_anchor && next < current.min_anchor
          ? "所选周期超出平台明确提供的查询范围"
          : "该周期尚未结束 请选择已结束的周期",
      );
      onChange(null);
      return;
    }
    setAnchor(next);
    setMessage("");
    onChange({ period_mode: mode, anchor_date: next });
  }
  function shift(amount: number) {
    const date = new Date(anchor + "T00:00:00Z");
    if (!anchor || !Number.isFinite(date.getTime())) {
      setMessage("请选择有效日期");
      onChange(null);
      return;
    }
    if (mode === "month") date.setUTCMonth(date.getUTCMonth() + amount);
    else
      date.setUTCDate(date.getUTCDate() + amount * (mode === "week" ? 7 : 1));
    changeDate(date.toISOString().slice(0, 10));
  }
  const inputValue = (value: string) =>
    !value
      ? ""
      : mode === "month"
        ? value.slice(0, 7)
        : mode === "week"
          ? weekValue(value)
          : value;
  return (
    <div className="period-section">
      <div className="period-controls">
        <div role="group" aria-label="统计时间入口" className="period-tabs">
          {Object.entries(periodLabels).map(([key, label]) => {
            const option = options.find((p) => p.mode === key);
            return (
              <button
                type="button"
                key={key}
                aria-pressed={mode === key && !!current?.available}
                disabled={disabled || !option?.available}
                title={option?.message || label}
                className={mode === key && current?.available ? "active" : ""}
                onClick={() => option && choose(option)}
              >
                {mode === key && current?.available && (
                  <motion.span
                    layoutId="period-highlight"
                    className="period-highlight"
                  />
                )}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {historical && current?.available ? (
            <motion.div
              key={mode}
              className="period-calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label="上一周期"
                onClick={() => shift(-1)}
                disabled={
                  disabled ||
                  !anchor ||
                  !Number.isFinite(Date.parse(anchor)) ||
                  (!!current.min_anchor && anchor <= current.min_anchor)
                }
              >
                <ChevronLeft size={15} />
              </Button>
              <label>
                <CalendarDays size={15} />
                <input
                  aria-label={`${periodLabels[mode]}统计日期`}
                  type={
                    mode === "month"
                      ? "month"
                      : mode === "week"
                        ? "week"
                        : "date"
                  }
                  value={inputValue(anchor)}
                  min={
                    current.min_anchor
                      ? inputValue(current.min_anchor)
                      : undefined
                  }
                  max={inputValue(current.max_anchor || "")}
                  disabled={disabled}
                  onChange={(e) =>
                    changeDate(
                      mode === "week"
                        ? fromWeek(e.target.value)
                        : mode === "month"
                          ? e.target.value
                            ? e.target.value + "-01"
                            : ""
                          : e.target.value,
                    )
                  }
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="下一周期"
                onClick={() => shift(1)}
                disabled={
                  disabled ||
                  !anchor ||
                  !Number.isFinite(Date.parse(anchor)) ||
                  anchor >= current.max_anchor!
                }
              >
                <ChevronRight size={15} />
              </Button>
            </motion.div>
          ) : (
            <motion.span
              key={mode}
              className="period-context"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Clock3 size={13} />
              {mode === "realtime"
                ? "单次快照 不自动刷新"
                : current?.available
                  ? "平台最新完整统计窗口"
                  : "等待识别"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="period-hint" role="status">
        {message ||
          (historical
            ? current?.min_anchor
              ? `平台可查询范围 ${current.min_anchor} 至 ${current.end_date || current.max_anchor}`
              : "可直接选择历史日期 无权限 超出查询期限或无数据时会显示平台实际结果"
            : mode === "realtime"
              ? "实时榜单可能在逐页读取期间变化 导出保留采集开始与结束时间"
              : "按已识别的平台滚动口径计算最新区间")}
      </p>
    </div>
  );
}
