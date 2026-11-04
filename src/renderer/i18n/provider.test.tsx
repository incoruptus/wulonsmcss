import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { I18nProvider, useI18n } from "@/i18n";

function Probe() {
  const { locale, t } = useI18n();
  return <span>{`${locale}|${t("settings.title", "设置")}|${t("missing.key", "未翻译")}`}</span>;
}

function render() {
  return renderToString(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("I18nProvider", () => {
  it("没有存储时用中文", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    expect(render()).toContain("zh-CN|设置|未翻译");
  });

  it("存储为英文时取英文词典", () => {
    vi.stubGlobal("localStorage", { getItem: () => "en-US", setItem: () => {} });
    expect(render()).toContain("en-US|Settings|未翻译");
  });

  it("缺条目回退调用处中文，不暴露 key", () => {
    vi.stubGlobal("localStorage", { getItem: () => "en-US", setItem: () => {} });
    const html = render();
    expect(html).toContain("未翻译");
    expect(html).not.toContain("missing.key");
  });
});
