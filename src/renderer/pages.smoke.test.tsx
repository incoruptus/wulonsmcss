import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
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
  return renderToString(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
}

describe("页面渲染回归", () => {
  it("加入页：没有房间码时渲染粘贴框，不白屏", () => {
    stubBridge();
    seedConfig();
    const html = render(<Join />, "/join");
    expect(html).toContain("加入游戏");
    expect(html).toContain("粘贴邀请链接");
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
      <MemoryRouter initialEntries={["/instances/i1/content?view=browse"]}>
        <ContentTab instance={instance as never} />
      </MemoryRouter>,
    );
    expect(html).toContain("已装模组");
    expect(html).toContain("资源库");
  });

  it("联机页：渲染 FRP 配置表单", () => {
    stubBridge();
    seedConfig();
    const html = render(<Network />, "/network");
    expect(html).toContain("隧道配置");
    expect(html).toContain("内网穿透");
  });

  it("配置为空时设置页也不崩", () => {
    stubBridge();
    useConfig.setState({ cfg: { version: 27, instances: [], activeInstanceId: null } as never, loaded: true } as never);
    const html = render(<Settings />, "/settings");
    expect(html).toContain("外观");
  });
});
