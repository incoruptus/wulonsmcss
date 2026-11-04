import React from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { reportError } from "@/lib/report";
import { useI18n } from "@/i18n";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  stack: string;
}

/**
 * 最后一层防线
 * ------------------------------------------------------------
 * React 的默认行为是：渲染期抛错 → 卸载整棵树 → 页面上什么都不剩。
 * 配上窗口的深色背景，用户看到的就是一面纯黑窗口，毫无信息（27.0.0 的事故）。
 *
 * 有这层边界以后，最坏情况是一张「界面出错了 + 原因 + 重载按钮」的卡片。
 *
 * I18nProvider 在 main.tsx 里包在这层边界外面，所以兜底卡片直接用 useI18n 取词。
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, stack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const stack = `${error.message}\n${error.stack ?? ""}\n--- component stack ---\n${info.componentStack ?? ""}`;
    this.setState({ stack });
    reportError("error-boundary", stack);
  }

  private reload = () => {
    location.reload();
  };

  private reset = () => {
    // 不刷新也要能继续用：清掉错误状态，回到首页
    this.setState({ error: null, stack: "" });
    location.hash = "#/";
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ErrorFallback message={error.message} stack={this.state.stack} onReload={this.reload} onReset={this.reset} />
    );
  }
}

function ErrorFallback({
  message,
  stack,
  onReload,
  onReset,
}: {
  message: string;
  stack: string;
  onReload: () => void;
  onReset: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="grid h-dvh place-items-center bg-background-200 p-6 text-gray-1000">
      <div className="w-full max-w-2xl rounded-xl bg-background-100 p-6 shadow-geist-border">
        <h1 className="t-h-20">{t("errorBoundary.title", "界面出了点问题")}</h1>
        <p className="t-label-13 mt-1 text-gray-800">
          {t("errorBoundary.desc", "界面渲染出错，服务器与存档不受影响。可点击「重新加载」重试。")}
        </p>

        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-gray-100 p-3 t-mono-12 text-gray-900 scroll-thin">
          {message}
          {stack ? `\n\n${stack}` : ""}
        </pre>

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={onReload}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-gray-1000 px-4 text-sm text-background-100 transition-opacity hover:opacity-90"
          >
            <RefreshCw className="size-4" />
            {t("errorBoundary.reload", "重新加载")}
          </button>
          <button
            onClick={onReset}
            className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-gray-900 shadow-geist-border transition-colors hover:bg-gray-100"
          >
            <RotateCcw className="size-4" />
            {t("errorBoundary.home", "回到首页")}
          </button>
        </div>

        <p className="mt-4 t-label-12 text-gray-700">
          {t("errorBoundary.log", "日志：")}
          <span className="t-mono-12">%APPDATA%\wulons-mcss\renderer.log</span>
        </p>
      </div>
    </div>
  );
}
