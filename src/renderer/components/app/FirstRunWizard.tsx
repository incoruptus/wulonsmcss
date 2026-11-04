import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Coffee,
  Download,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  Plug,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, Slider } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Badge, Progress } from "@/components/ui/misc";
import { useConfig, makeInstance } from "@/stores/config";
import type { JavaInfo, McVersion, ServerType } from "@/lib/types";
import { cx, formatCount, safeName } from "@/lib/utils";
import { normalizeLoaders, pickLoader } from "@/lib/loaders";
import { javaMajorFor, pickJavaFor } from "@/lib/java-compat";
import { pickPath } from "@/lib/path-picker";
import { detectShell } from "@/lib/shell";
import { agentDownloadReady, agentDownloadUrl } from "@/lib/links";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import {
  CORES,
  buildVersionPresets,
  clientRequirementText,
  coreMeta,
  intentsFor,
  presetText,
  recommendedCore,
  recommendedVersion,
  serverLabel,
  type ServerIntent,
  type VersionPreset,
} from "@/lib/server-guide";
import { useI18n } from "@/i18n";

const JAVA_DOWNLOAD = "https://adoptium.net/temurin/releases/?version=25&os=windows&arch=x64&package=jre";

interface Eco {
  mods: number | null;
  plugins: number | null;
}

/**
 * 第一次开服：先问「你想怎么玩」，再给版本卡片，最后确认。
 * 这里刻意不把 Java / 构建号 / 安装目录放在第一屏——那是给已经懂的人看的。
 */
export function FirstRunWizard({ open, onDone }: { open: boolean; onDone: () => void }) {
  const navigate = useNavigate();
  const addInstance = useConfig((s) => s.addInstance);
  const { t } = useI18n();

  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<ServerIntent>("vanilla");

  // 网页版的第一道门：页面读不到硬盘，必须先把本机助手装起来
  const shell = detectShell();
  const webGate = shell === "web";
  const agent = useAgentStatus(open && webGate);
  const [gatePassed, setGatePassed] = useState(!webGate);

  useEffect(() => {
    if (!open) return;
    // 每次打开都先要求「助手可用」；真的连上了，下面的 effect 会立刻放行
    if (!webGate) setGatePassed(true);
    else setGatePassed(false);
    // agent.status 不放进依赖：反复检查时不该把已经通过的步骤又锁回去
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, webGate]);

  useEffect(() => {
    if (agent.status === "online") setGatePassed(true);
  }, [agent.status]);

  const [versions, setVersions] = useState<McVersion[]>([]);
  const [presets, setPresets] = useState<VersionPreset[]>([]);
  const [eco, setEco] = useState<Record<string, Eco>>({});
  const [mcVersion, setMcVersion] = useState("");
  const [core, setCore] = useState<ServerType>("paper");
  const [builds, setBuilds] = useState<string[]>([]);
  const [build, setBuild] = useState("");
  const [buildError, setBuildError] = useState<string | null>(null);

  const [javas, setJavas] = useState<JavaInfo[]>([]);
  const [javaOverride, setJavaOverride] = useState("");
  const [checking, setChecking] = useState(false);

  const [name, setName] = useState("");
  const [baseDir, setBaseDir] = useState("");
  const [dir, setDir] = useState("");
  const [memoryMax, setMemoryMax] = useState(4);
  const [totalMem, setTotalMem] = useState<number | null>(null);

  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent: number; detail?: string } | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // 网页版在助手连上之前拿不到 info / 版本列表；等门通过后再加载一次
    if (webGate && !gatePassed) return;
    // 重新打开时回到第一步；成功页不应该残留
    setStep(0);
    setCreatedId(null);
    let alive = true;
    void (async () => {
      // 助手是刚刚装上的：先把启动时没读到的配置补回来，避免用空列表覆盖本机已有实例
      if (webGate && gatePassed) {
        await useConfig.getState().load();
        if (!alive) return;
      }
      setChecking(true);
      const [info, list, js] = await Promise.all([
        window.mcss.app.info().catch(() => null),
        window.mcss.versions.minecraft().catch(() => [] as McVersion[]),
        window.mcss.app.detectJava().catch(() => [] as JavaInfo[]),
      ]);
      if (!alive) return;
      if (info) {
        setBaseDir(`${info.appData}\\instances`);
        setName((n) => n || "我的服务器");
        const gb = Number(info.totalMemGb) || 0;
        setTotalMem(gb || null);
        setMemoryMax(Math.max(2, Math.min(8, gb ? Math.floor(gb / 2) : 4)));
      }
      setVersions(list);
      setJavas(js);
      const nextPresets = buildVersionPresets(list);
      setPresets(nextPresets);
      const rec = recommendedVersion("vanilla", nextPresets);
      setMcVersion((v) => v || rec);
      setCore("paper");
      setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, webGate, gatePassed]);

  useEffect(() => {
    if (!open || !presets.length) return;
    let alive = true;
    void window.mcss.versions
      .ecosystem(presets.map((p) => p.id))
      .then((data) => alive && setEco(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, presets]);

  // 版本 / 核心联动：拿构建列表；Paper 26.1 没构建时自动落到 26.1.2
  useEffect(() => {
    if (!open || !mcVersion) return;
    let alive = true;
    setBuildError(null);
    window.mcss.versions
      .serverBuilds(core, mcVersion)
      .then((raw) => {
        if (!alive) return;
        const list = normalizeLoaders(raw);
        if (!list.length && (core === "paper" || core === "purpur") && mcVersion === "26.1") {
          setMcVersion("26.1.2");
          return;
        }
        setBuilds(list);
        setBuild((v) => pickLoader(v, list));
      })
      .catch((e) => {
        if (!alive) return;
        setBuilds([]);
        setBuild("");
        setBuildError((e as Error).message);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mcVersion, core]);

  const finalDir = useMemo(() => {
    if (dir) return dir;
    return baseDir ? `${baseDir}\\${safeName(name || `${mcVersion}-${core}`)}` : "";
  }, [dir, name, mcVersion, core, baseDir]);

  const requiredJava = javaMajorFor(mcVersion);
  const manualJava = javas.find((j) => j.path === javaOverride);
  const chosenJava =
    manualJava && Number(manualJava.major) >= requiredJava ? manualJava : pickJavaFor(javas, requiredJava);
  const javaOk = Boolean(chosenJava);
  const coreInfo = coreMeta(core, t);
  const releaseOptions = useMemo(
    () =>
      versions
        .filter((v) => v.type === "release")
        .map((v) => ({ value: v.id, label: v.id })),
    [versions],
  );

  function chooseIntent(next: ServerIntent) {
    setIntent(next);
    const rec = recommendedVersion(next, presets);
    if (rec) setMcVersion(rec);
    setCore(recommendedCore(next, rec || mcVersion));
    setStep(1);
  }

  function chooseVersion(v: string) {
    setMcVersion(v);
    // NeoForge 暂不支持新建；模组平台始终留在 Fabric
    if (intent === "mods") setCore("fabric");
  }

  async function detectJava() {
    setChecking(true);
    const js = await window.mcss.app.detectJava().catch(() => []);
    setJavas(js);
    setChecking(false);
    if (!pickJavaFor(js, requiredJava)) toast.warning(t("wizard.toast.javaMissing", "还需要 Java {n}", { n: requiredJava }));
  }

  async function install() {
    if (!name.trim()) return toast.error(t("wizard.toast.needName", "给服务器起个名字"));
    if (!mcVersion) return toast.error(t("wizard.toast.needVersion", "选一个 Minecraft 版本"));
    if (!chosenJava) return toast.error(t("wizard.toast.needJava", "这个版本需要 Java {n}", { n: requiredJava }));
    if (!finalDir) return toast.error(t("wizard.toast.needDir", "还没有确定安装目录，请在高级选项里选一个文件夹"));
    setInstalling(true);
    setProgress({ stage: t("wizard.progress.preparing", "准备中"), percent: 0 });
    const off = window.mcss.versions.onProgress(setProgress);
    try {
      const res = await window.mcss.versions.install({
        dir: finalDir,
        mc: mcVersion,
        serverType: core,
        loaderVersion: core === "fabric" ? build : undefined,
        build: core === "paper" || core === "purpur" || core === "forge" ? build : undefined,
        javaPath: chosenJava.path,
      });
      if (!res.ok) throw new Error(res.error || t("wizard.toast.installError", "安装失败"));
      const inst = makeInstance({
        name: name.trim(),
        dir: finalDir,
        mcVersion,
        serverType: core,
        loaderVersion: core === "fabric" ? build : undefined,
        javaPath: chosenJava.path,
        memoryMin: Math.min(2, memoryMax),
        memoryMax,
      });
      await addInstance(inst);
      setCreatedId(inst.id);
      toast.success(t("wizard.toast.installed", "服务器装好了"));
    } catch (e) {
      toast.error(t("wizard.toast.installFailed", "安装失败：{msg}", { msg: (e as Error).message }));
    } finally {
      off();
      setInstalling(false);
      setProgress(null);
    }
  }

  function finish(then: "open" | "library" = "open") {
    onDone();
    if (!createdId) return;
    if (then === "library") navigate(`/instances/${createdId}/content?view=browse`);
    else navigate("/");
  }

  const canNext = step === 0 ? true : step === 1 ? Boolean(mcVersion) : true;
  const steps = [
    ...(webGate ? [t("wizard.step.helper", "装助手")] : []),
    t("wizard.step.intent", "怎么玩"),
    t("wizard.step.version", "选版本"),
    t("wizard.step.confirm", "确认"),
  ];
  const displayStep = gatePassed && webGate ? step + 1 : step;
  const gate = webGate && !gatePassed;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !installing && finish()} widthClass="max-w-2xl">
      <div className="border-b border-gray-300 px-5 pb-4 pt-5">
        <div className="t-h-20 text-gray-1000">{t("wizard.title", "先把它开起来")}</div>
        <p className="t-label-13 mt-1 text-gray-800">
          {webGate
            ? t("wizard.desc.web", "网页本身碰不到硬盘。先装一个本机助手，之后的步骤会自动在这台电脑上完成。")
            : t("wizard.desc.normal", "不需要提前了解参数，回答三个问题后，会按推荐配置为你准备好。")}
        </p>
        <div className="mt-4 flex items-center gap-2">
          {steps.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={cx(
                  "grid size-6 shrink-0 place-items-center rounded-full t-label-12",
                  i < displayStep ? "bg-green-800/15 text-green-900" : i === displayStep ? "bg-gray-1000 text-background-100" : "bg-gray-200 text-gray-700",
                )}
              >
                {i < displayStep ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span className={cx("t-label-12", i === displayStep ? "text-gray-1000" : "text-gray-700")}>{label}</span>
              {i < steps.length - 1 ? <div className="h-px flex-1 bg-gray-300" /> : null}
            </div>
          ))}
        </div>
      </div>

      <DialogBody className="space-y-4">
        {gate ? (
          <div className="space-y-3.5">
            <div className="rounded-xl bg-background-200 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-700" />
                <span className="t-label-14 font-medium text-gray-1000">{t("wizard.gate.title", "网页不能直接读这台电脑")}</span>
              </div>
              <p className="mt-1.5 t-copy-13 leading-6 text-gray-800">
                {t(
                  "wizard.gate.desc",
                  "浏览器出于安全限制，拿不到硬盘路径，也启动不了 Java。装好助手后，读存档、写服务端文件、启动和停止服务器都由它在本机完成，网页只负责显示。",
                )}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { step: "1", title: t("wizard.gate.step1.title", "下载安装包"), detail: t("wizard.gate.step1.detail", "点下面的按钮，保存到电脑") },
                { step: "2", title: t("wizard.gate.step2.title", "双击安装"), detail: t("wizard.gate.step2.detail", "一路下一步，不用改设置") },
                { step: "3", title: t("wizard.gate.step3.title", "回到这里"), detail: t("wizard.gate.step3.detail", "检测到助手后自动继续") },
              ].map((item) => (
                <div key={item.step} className="rounded-lg bg-background-200 p-3">
                  <span className="grid size-6 place-items-center rounded-full bg-brand-100 t-label-12 text-brand-700">{item.step}</span>
                  <p className="mt-1.5 t-label-13 font-medium text-gray-1000">{item.title}</p>
                  <p className="mt-0.5 t-label-12 leading-4 text-gray-700">{item.detail}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-200 p-3">
              <span
                className={cx(
                  "size-2 shrink-0 rounded-full",
                  agent.status === "online" ? "bg-green-800" : agent.status === "checking" ? "bg-amber-700" : "bg-gray-500",
                )}
              />
              <span className="t-label-13 text-gray-900">
                {agent.status === "checking"
                  ? t("wizard.agent.checking", "正在检查这台电脑上的助手…")
                  : agent.status === "online"
                    ? t("wizard.agent.connected", "助手已连接{v}", {
                        v: agent.version
                          ? t("wizard.agent.version", " · 版本 {v}", { v: agent.version })
                          : "",
                      })
                    : agent.status === "blocked"
                      ? t("wizard.agent.blocked", "助手在运行，但这个页面还没有连上")
                      : t("wizard.agent.none", "还没有检测到助手")}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {agentDownloadReady() ? (
                  <Button size="sm" onClick={() => window.open(agentDownloadUrl(), "_blank", "noopener,noreferrer")}>
                    <Download className="size-3.5" />
                    {t("wizard.gate.download", "下载安装包")}
                  </Button>
                ) : (
                  <span className="t-label-12 text-gray-700">
                    {t("wizard.gate.noDownload", "安装包暂时没有发布地址，请向发你链接的人要")}
                  </span>
                )}
                <Button size="sm" variant="secondary" onClick={() => void agent.refresh()} loading={agent.refreshing}>
                  <RefreshCw className="size-3.5" />
                  {t("wizard.gate.installed", "我已经装好了")}
                </Button>
              </span>
            </div>

            {agent.status === "blocked" ? (
              <p className="rounded-lg bg-amber-700/10 p-3 t-label-12 leading-5 text-amber-900">
                {t(
                  "wizard.gate.blockedNote",
                  "这个页面被助手拒绝了，通常是助手版本太旧，或者浏览器里存着旧的配对信息。先把助手从任务管理器结束，再从开始菜单重新打开；仍然不行就重新运行一次安装包。",
                )}
              </p>
            ) : null}

            <details className="rounded-lg bg-background-200 p-3">
              <summary className="cursor-pointer t-label-13 text-gray-900">{t("wizard.gate.after.summary", "安装后会发生什么")}</summary>
              <ul className="mt-2 space-y-1 t-label-12 leading-5 text-gray-800">
                <li>{t("wizard.gate.after.1", "· 助手在后台运行，没有窗口；开机时会自己起来，也可以稍后在设置里关掉。")}</li>
                <li>{t("wizard.gate.after.2", "· 它只监听这台电脑的 127.0.0.1，局域网和互联网上的其他设备都连不进来。")}</li>
                <li>{t("wizard.gate.after.3", "· 想彻底关掉时，在任务管理器结束 mcss-agent.exe；不会弹任何确认框。")}</li>
                <li>{t("wizard.gate.after.4", "· 安装位置在用户目录，不需要管理员权限；卸载走开始菜单里的卸载项。")}</li>
              </ul>
            </details>
          </div>
        ) : null}

        {!gate && step === 0 ? (
          <div className="space-y-2.5">
            <p className="t-label-12 text-gray-700">{t("wizard.intent.hint", "选择最贴近你使用习惯的一项，之后可随时更改。")}</p>
            {intentsFor(t).map((it) => {
              const Icon = it.id === "vanilla" ? Gamepad2 : it.id === "plugins" ? Plug : Puzzle;
              const active = intent === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => chooseIntent(it.id)}
                  className={cx(
                    "flex w-full items-start gap-3 rounded-xl p-3.5 text-left transition-colors",
                    active ? "bg-gray-100 shadow-geist-border" : "bg-background-200 hover:bg-gray-100",
                  )}
                >
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-900">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-label-14 block font-medium text-gray-1000">{it.title}</span>
                    <span className="t-label-12 mt-0.5 block text-gray-800">{it.subtitle}</span>
                    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {it.points.map((p) => (
                        <span key={p} className="t-label-12 text-gray-700">· {p}</span>
                      ))}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-gray-600" />
                </button>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => chooseIntent("vanilla")}>
                <Sparkles className="size-3.5" />
                {t("wizard.intent.recommended", "不确定，使用推荐配置")}
              </Button>
              <span className="t-label-12 text-gray-700">
                {t("wizard.intent.recommendedHint", "默认配置：Paper + 最新版本，朋友无需安装额外内容")}
              </span>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="t-h-14 text-gray-1000">{t("wizard.version.title", "选游戏版本")}</span>
                <span className="t-label-12 text-gray-700">{t("wizard.version.desc", "不同游戏版本可用的模组与插件数量差异较大")}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {presets.map((p) => {
                  const selected = mcVersion === p.id;
                  const stats = eco[p.id];
                  const java = javaMajorFor(p.id);
                  const { tag, why } = presetText(p, t);
                  return (
                    <button
                      key={p.id}
                      onClick={() => chooseVersion(p.id)}
                      className={cx(
                        "rounded-xl p-3 text-left transition-colors",
                        selected ? "bg-gray-100 shadow-[0_0_0_2px_var(--ds-gray-1000)]" : "bg-background-200 hover:bg-gray-100",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="t-mono-13 font-medium text-gray-1000">{p.id}</span>
                        <Badge variant={p.latest ? "green" : p.tag === "兼容经典模组最多" ? "amber" : "blue"} size="sm">
                          {tag}
                        </Badge>
                        {selected ? <Check className="ml-auto size-3.5 text-gray-1000" /> : null}
                      </div>
                      <p className="mt-1 t-label-12 leading-4 text-gray-800">{why}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 t-label-12 text-gray-700">
                        <span>Java {java}</span>
                        <span>
                          {t("wizard.version.stats", "Mod {mods} · 插件 {plugins}", {
                            mods: stats?.mods != null ? formatCount(stats.mods) : "—",
                            plugins: stats?.plugins != null ? formatCount(stats.plugins) : "—",
                          })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {intent === "mods" ? (
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="t-h-14 text-gray-1000">{t("wizard.core.title", "选模组平台")}</span>
                  <span className="t-label-12 text-gray-700">{t("wizard.core.desc", "朋友也要装同样的平台")}</span>
                </div>
                <div className="grid gap-2">
                  {CORES.filter((c) => c.type === "fabric" && c.supported !== false).map((c) => {
                    const meta = coreMeta(c.type, t) ?? c;
                    return (
                      <button
                        key={c.type}
                        onClick={() => setCore(c.type)}
                        className={cx(
                          "rounded-xl p-3 text-left transition-colors",
                          core === c.type ? "bg-gray-100 shadow-[0_0_0_2px_var(--ds-gray-1000)]" : "bg-background-200 hover:bg-gray-100",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="t-label-14 font-medium text-gray-1000">{meta.label}</span>
                          {core === c.type ? <Check className="ml-auto size-3.5" /> : null}
                        </div>
                        <p className="mt-1 t-label-12 text-gray-800">{meta.tagline}</p>
                        <p className="mt-0.5 t-label-12 text-gray-700">{meta.client}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 t-label-12 leading-5 text-gray-700">
                  {t(
                    "wizard.core.neoNote",
                    "暂不支持新建 NeoForge 服务器，官方安装器尚不稳定。已有 NeoForge 服务器可在「全部服务器 → 导入现有服务器」中继续管理。",
                  )}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-200 px-3 py-2">
                <span className="t-label-13 text-gray-1000">
                  {t("wizard.server.label", "服务端：{name}", { name: serverLabel(core, t) })}
                </span>
                <span className="t-label-12 text-gray-700">· {coreInfo?.client}</span>
                <button
                  className="ml-auto t-label-12 text-blue-900 hover:underline"
                  onClick={() => setCore(core === "paper" ? "vanilla" : "paper")}
                >
                  {core === "paper"
                    ? t("wizard.core.toVanilla", "如需纯原版体验，可改用 Vanilla")
                    : t("wizard.core.toPaper", "换回更推荐的 Paper")}
                </button>
              </div>
            )}

            <div className={cx("flex flex-wrap items-center gap-2 rounded-lg p-2.5", javaOk ? "bg-green-800/10" : "bg-amber-700/10")}>
              <Coffee className={cx("size-4", javaOk ? "text-green-900" : "text-amber-900")} />
              <span className={cx("t-label-13", javaOk ? "text-green-900" : "text-amber-900")}>
                {javaOk
                  ? t("wizard.java.ready", "运行环境已就绪：Java {n}", { n: chosenJava?.major })
                  : t("wizard.java.missing", "该版本需要 Java {n}，当前未检测到", { n: requiredJava })}
              </span>
              {javaOk ? (
                <span className="t-label-12 text-gray-700">{t("wizard.java.readyHint", "已检测到运行环境，点击下一步继续")}</span>
              ) : (
                <span className="ml-auto flex items-center gap-2">
                  <Button size="xs" variant="secondary" onClick={() => window.mcss.app.openExternal(JAVA_DOWNLOAD)}>
                    <ExternalLink className="size-3" />
                    {t("wizard.java.download", "下载 Java")}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={detectJava} loading={checking}>
                    {t("wizard.java.redetect", "重新检测")}
                  </Button>
                </span>
              )}
            </div>
          </div>
        ) : null}

        {step === 2 && !createdId ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-background-200 p-3.5">
              <div className="t-label-12 text-gray-700">{t("wizard.confirm.got", "你会得到")}</div>
              <div className="mt-1 t-h-16 text-gray-1000">
                {serverLabel(core, t)} {mcVersion}
              </div>
              <ul className="mt-2 space-y-1">
                <li className="flex items-center gap-1.5 t-label-13 text-gray-900">
                  <Check className="size-3.5 text-green-900" />
                  {clientRequirementText(core, t)}
                </li>
                <li className="flex items-center gap-1.5 t-label-13 text-gray-900">
                  <Check className="size-3.5 text-green-900" />
                  {t("wizard.confirm.java", "需要 Java {n}：{state}", {
                    n: requiredJava,
                    state: chosenJava
                      ? t("wizard.confirm.javaFound", "已找到 Java {n}", { n: chosenJava.major })
                      : t("wizard.confirm.javaNotFound", "还没找到"),
                  })}
                </li>
                <li className="flex items-center gap-1.5 t-label-13 text-gray-900">
                  <Check className="size-3.5 text-green-900" />
                  {intent === "mods"
                    ? t("wizard.confirm.modsHint", "之后可在「模组 → 资源库」中添加模组")
                    : t("wizard.confirm.pluginsHint", "之后可在「插件 → 资源库」中添加插件")}
                </li>
              </ul>
            </div>

            <Field
              label={t("wizard.name.label", "服务器名称")}
              hint={t("wizard.name.hint", "玩家在游戏内看到的名称，之后仍可修改")}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("wizard.name.placeholder", "我的服务器")} />
            </Field>

            {!javaOk ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-700/10 p-3">
                <AlertTriangle className="size-4 shrink-0 text-amber-900" />
                <span className="t-label-13 text-amber-900">
                  {t("wizard.java.warn", "还差 Java {n}。装好之后点「重新检测」；没有 Java 服务端起不来。", { n: requiredJava })}
                </span>
                <Button size="xs" variant="secondary" onClick={() => window.mcss.app.openExternal(JAVA_DOWNLOAD)}>
                  {t("wizard.java.downloadVersion", "下载 Java {n}", { n: requiredJava })}
                </Button>
                <Button size="xs" variant="ghost" onClick={detectJava} loading={checking}>
                  {t("wizard.java.redetect", "重新检测")}
                </Button>
              </div>
            ) : null}

            {core !== "vanilla" && builds.length === 0 ? (
              <div className="rounded-lg bg-amber-700/10 p-3 t-label-13 text-amber-900">
                {buildError
                  ? t("wizard.build.error", "拿不到 {server} {version} 的构建：{msg}", {
                      server: serverLabel(core, t),
                      version: mcVersion,
                      msg: buildError,
                    })
                  : t("wizard.build.none", "{server} 暂无 {version} 的服务端版本，请更换游戏版本或服务端。", {
                      server: serverLabel(core, t),
                      version: mcVersion,
                    })}
              </div>
            ) : null}

            <details className="rounded-lg bg-background-200 p-3">
              <summary className="cursor-pointer t-label-13 text-gray-900">
                {t("wizard.advanced.summary", "高级选项（内存 / 安装目录 / Java / 服务端版本）")}
              </summary>
              <div className="mt-3 space-y-3">
                <Field
                  label={t("wizard.advanced.memory", "最大内存 {n} GB", { n: memoryMax })}
                  hint={
                    totalMem
                      ? t("wizard.advanced.memoryHint", "本机内存约 {n} GB，小型服务器 4 GB 已够用", { n: totalMem })
                      : t("wizard.advanced.memoryHintFallback", "小服 4G 够用")
                  }
                >
                  <Slider
                    ariaLabel={t("wizard.advanced.memoryAria", "最大内存")}
                    min={2}
                    max={Math.max(2, Math.min(32, totalMem || 32))}
                    step={1}
                    value={[memoryMax]}
                    onValueChange={([v]) => setMemoryMax(v)}
                  />
                </Field>
                <Field label={t("wizard.advanced.dir", "安装目录")} hint={finalDir}>
                  <div className="flex gap-2">
                    <Input value={finalDir} onChange={(e) => setDir(e.target.value)} className="font-mono text-[12px]" />
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const p = await pickPath({
                          mode: "dir",
                          title: t("wizard.advanced.dirPick", "选择服务器安装位置"),
                          defaultPath: finalDir,
                        });
                        if (p) setDir(p);
                      }}
                    >
                      <FolderOpen className="size-4" />
                    </Button>
                  </div>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("wizard.advanced.otherVersion", "其他版本")}>
                    <Picker value={mcVersion} onValueChange={chooseVersion} options={releaseOptions} />
                  </Field>
                  <Field label={t("wizard.advanced.java", "Java 运行时")}>
                    <Picker
                      value={chosenJava?.path ?? ""}
                      onValueChange={setJavaOverride}
                      options={javas.map((j) => ({ value: j.path, label: `Java ${j.major ?? "?"}`, disabled: false }))}
                    />
                  </Field>
                </div>
                {core !== "vanilla" && builds.length > 0 ? (
                  <Field
                    label={core === "fabric" ? "Fabric Loader" : t("wizard.advanced.build", "服务端版本")}
                    hint={t("wizard.advanced.buildHint", "默认已选最新稳定版")}
                  >
                    <Picker value={build} onValueChange={setBuild} options={builds.map((b) => ({ value: b, label: b }))} />
                  </Field>
                ) : null}
              </div>
            </details>

            {progress ? (
              <div className="rounded-lg bg-background-200 p-3">
                <div className="mb-2 flex items-center justify-between t-label-12 text-gray-800">
                  <span>{progress.stage}</span>
                  <span className="t-mono-12">{progress.detail || `${progress.percent}%`}</span>
                </div>
                <Progress value={Math.max(2, progress.percent)} label={progress.stage} />
              </div>
            ) : null}
          </div>
        ) : null}

        {createdId ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-green-800/10 p-4">
              <div className="t-h-16 text-green-900">{t("wizard.ready.title", "服务器已就绪")}</div>
              <p className="mt-1 t-label-13 text-gray-800">
                {name} · {serverLabel(core, t)} {mcVersion} · {finalDir}
              </p>
              <p className="mt-1 t-label-12 text-gray-700">
                {t("wizard.ready.hint", "下一步：启动服务器，然后生成邀请发给朋友。")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => finish("open")}>
                {t("wizard.ready.start", "去启动服务器")}
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="secondary" onClick={() => finish("library")}>
                <Plug className="size-4" />
                {intent === "mods" ? t("wizard.ready.mods", "去装 Mod") : t("wizard.ready.plugins", "去装插件")}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogBody>

      <DialogFooter>
        {step === 0 ? (
          <Button variant="ghost" onClick={() => finish()} disabled={installing}>
            {t("wizard.footer.later", "稍后再说")}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={installing || Boolean(createdId)}>
            <ArrowLeft className="size-4" />
            {t("wizard.footer.prev", "上一步")}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {gate ? (
            <span className="t-label-12 text-gray-700">{t("wizard.footer.gateHint", "装好后会自动进入下一步")}</span>
          ) : createdId ? null : step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext || checking}>
              {t("wizard.footer.next", "下一步")}
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={install}
              loading={installing}
              disabled={!chosenJava || (core !== "vanilla" && builds.length === 0) || !name.trim() || !finalDir}
              title={
                !chosenJava
                  ? t("wizard.footer.needJava", "需要 Java {n}", { n: requiredJava })
                  : core !== "vanilla" && builds.length === 0
                    ? t("wizard.footer.noBuild", "这个核心/版本没有可用构建")
                    : !finalDir
                      ? t("wizard.footer.noDir", "先确定安装目录")
                      : undefined
              }
            >
              {installing ? null : <Download className="size-4" />}
              {t("wizard.footer.install", "下载并安装服务端")}
            </Button>
          )}
        </div>
      </DialogFooter>
    </Dialog>
  );
}
