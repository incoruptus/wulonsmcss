import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/i18n";
import { useConfig } from "@/stores/config";
import Join from "./pages/Join";
import Settings from "./pages/Settings";
import Network from "./pages/Network";
import { ContentTab } from "./components/instance/ContentTab";

/**
 * 页面渲染回归
 * ------------------------------------------------------------
 * 不点按钮，只回答一个问题：**这些页面在当前状态下会不会白屏/抛错**。
 * 之前这类问题只能靠截图发现（比如 zustand 选择器返回新对象导致的整窗黑屏），
 * 现在让它变成一条能在 CI 里跑的断言。
 */

const instance = {
  id: "i1",
  name: "MCServer",
  dir: "D:\\srv",
  mcVersion: "26.1",
  loader: "fabric",
  loaderVersion: "0.20.1",
  javaPath: "java",
  memoryMin: 2,
  memoryMax: 8,
  jvmArgs: "",
  port: 25565,
  createdAt: 0,
  updatedAt: 0,
};

/** 最小可用的 window.mcss：SSR 阶段只用到同步读的东西 */
function stubBridge() {
  const noop = async () => null;
  (globalThis as unknown as { window: unknown }).window = {
    location: { search: "", hash: "" },
    mcss: {
      app: { info: noop, detectLaunchers: async () => [], lanAddress: async () => ({ ip: "127.0.0.1" }), openPath: noop },
      config: { read: async () => ({}) },
      server: { status: async () => "stopped" },
      net: { ping: async () => ({ ok: false }), probe: async () => ({ ok: false, ms: 0 }) },
      fs: { list: async () => [], read: async () => "", exists: async () => false },
      mods: { scan: async () => [] },
      backup: { list: async () => [], snapshots: async () => [] },
    },
  };
}

function seedConfig() {
  useConfig.setState({
    cfg: { version: 27, instances: [instance], activeInstanceId: "i1" } as never,
    loaded: true,
  } as never);
}

function render(node: React.ReactElement, path = "/") {
  // 页面里的界面文案走 useI18n，测试也要在 Provider 里渲染
  return renderToString(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("页面渲染回归", () => {
  it("加入页：没有房间码时渲染粘贴框，不白屏", () => {
    stubBridge();
    seedConfig();
    const html = render(<Join />, "/join");
    expect(html).toContain("加入游戏");
    expect(html).toContain("邀请链接或房间码");
  });

  it("设置页：渲染外观与同步区块，且不再有自选强调色", () => {
    stubBridge();
    seedConfig();
    const html = render(<Settings />, "/settings");
    expect(html).toContain("外观");
    expect(html).toContain("跨端同步");
    expect(html).toContain("日志保留行数");
    expect(html).not.toContain("强调色");
    expect(html).not.toContain("气泡");
  });

  it("实例内容页：资源库是实例内的一个视图，不再是一级页面", () => {
    stubBridge();
    seedConfig();
    const html = renderToString(
      <I18nProvider>
        <MemoryRouter initialEntries={["/instances/i1/content?view=browse"]}>
          <ContentTab instance={instance as never} />
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(html).toContain("已装模组");
    expect(html).toContain("资源库");
  });

  it("联机页：渲染 FRP 配置表单", () => {
    stubBridge();
    seedConfig();
    const html = render(<Network />, "/network");
    expect(html).toContain("中转线路");
    expect(html).toContain("让朋友进来");
  });

  it("配置为空时设置页也不崩", () => {
    stubBridge();
    useConfig.setState({ cfg: { version: 27, instances: [], activeInstanceId: null } as never, loaded: true } as never);
    const html = render(<Settings />, "/settings");
    expect(html).toContain("外观");
  });
  it("英文界面：设置页渲染英文，不再出现中文标题", () => {
    stubBridge();
    seedConfig();
    vi.stubGlobal("localStorage", { getItem: () => "en-US", setItem: () => {} });
    const html = render(<Settings />, "/settings");
    expect(html).toContain("Settings");
    expect(html).toContain("Appearance");
    expect(html).not.toContain("关于开服茶");
  });

});
