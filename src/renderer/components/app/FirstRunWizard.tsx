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
  Sparkles,
} from "lucide-react";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, Slider } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Badge } from "@/components/ui/misc";
import { useConfig, makeInstance } from "@/stores/config";
import type { JavaInfo, McVersion, ServerType } from "@/lib/types";
import { cx, formatCount, safeName } from "@/lib/utils";
import { normalizeLoaders, pickLoader } from "@/lib/loaders";
import { javaMajorFor, pickJavaFor } from "@/lib/java-compat";
import {
  CORES,
  INTENTS,
  buildVersionPresets,
  clientRequirementText,
  coreMeta,
  recommendedCore,
  recommendedVersion,
  serverLabel,
  type ServerIntent,
  type VersionPreset,
} from "@/lib/server-guide";

const STEPS = ["怎么玩", "选版本", "确认"] as const;
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

  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<ServerIntent>("vanilla");

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
    // 重新打开时回到第一步；成功页不应该残留
    setStep(0);
    setCreatedId(null);
    let alive = true;
    void (async () => {
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
  }, [open]);

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
  const coreInfo = coreMeta(core);
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
    if (!pickJavaFor(js, requiredJava)) toast.warning(`还需要 Java ${requiredJava}`);
  }

  async function install() {
    if (!name.trim()) return toast.error("给服务器起个名字");
    if (!mcVersion) return toast.error("选一个 Minecraft 版本");
    if (!chosenJava) return toast.error(`这个版本需要 Java ${requiredJava}`);
    setInstalling(true);
    setProgress({ stage: "准备中", percent: 0 });
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
      if (!res.ok) throw new Error(res.error || "安装失败");
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
      toast.success("服务器装好了");
    } catch (e) {
      toast.error(`安装失败：${(e as Error).message}`);
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !installing && finish()} widthClass="max-w-2xl">
      <div className="border-b border-gray-300 px-5 pb-4 pt-5">
        <div className="t-h-20 text-gray-1000">先把它开起来</div>
        <p className="t-label-13 mt-1 text-gray-800">
          不需要提前了解参数，回答三个问题后，会按推荐配置为你准备好。
        </p>
        <div className="mt-4 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={cx(
                  "grid size-6 shrink-0 place-items-center rounded-full t-label-12",
                  i < step ? "bg-green-800/15 text-green-900" : i === step ? "bg-gray-1000 text-background-100" : "bg-gray-200 text-gray-700",
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span className={cx("t-label-12", i === step ? "text-gray-1000" : "text-gray-700")}>{label}</span>
              {i < STEPS.length - 1 ? <div className="h-px flex-1 bg-gray-300" /> : null}
            </div>
          ))}
        </div>
      </div>

      <DialogBody className="space-y-4">
        {step === 0 ? (
          <div className="space-y-2.5">
            <p className="t-label-12 text-gray-700">选择最贴近你使用习惯的一项，之后可随时更改。</p>
            {INTENTS.map((it) => {
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
                不确定，使用推荐配置
              </Button>
              <span className="t-label-12 text-gray-700">默认配置：Paper + 最新版本，朋友无需安装额外内容</span>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="t-h-14 text-gray-1000">选游戏版本</span>
                <span className="t-label-12 text-gray-700">不同游戏版本可用的模组与插件数量差异较大</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {presets.map((p) => {
                  const selected = mcVersion === p.id;
                  const stats = eco[p.id];
                  const java = javaMajorFor(p.id);
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
                        <Badge variant={p.tag === "最新" ? "green" : p.tag === "兼容经典模组最多" ? "amber" : "blue"} size="sm">
                          {p.tag}
                        </Badge>
                        {selected ? <Check className="ml-auto size-3.5 text-gray-1000" /> : null}
                      </div>
                      <p className="mt-1 t-label-12 leading-4 text-gray-800">{p.why}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 t-label-12 text-gray-700">
                        <span>Java {java}</span>
                        <span>
                          Mod {stats?.mods != null ? formatCount(stats.mods) : "—"} · 插件{" "}
                          {stats?.plugins != null ? formatCount(stats.plugins) : "—"}
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
                  <span className="t-h-14 text-gray-1000">选模组平台</span>
                  <span className="t-label-12 text-gray-700">朋友也要装同样的平台</span>
                </div>
                <div className="grid gap-2">
                  {CORES.filter((c) => c.type === "fabric" && c.supported !== false).map((c) => (
                    <button
                      key={c.type}
                      onClick={() => setCore(c.type)}
                      className={cx(
                        "rounded-xl p-3 text-left transition-colors",
                        core === c.type ? "bg-gray-100 shadow-[0_0_0_2px_var(--ds-gray-1000)]" : "bg-background-200 hover:bg-gray-100",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="t-label-14 font-medium text-gray-1000">{c.label}</span>
                        {core === c.type ? <Check className="ml-auto size-3.5" /> : null}
                      </div>
                      <p className="mt-1 t-label-12 text-gray-800">{c.tagline}</p>
                      <p className="mt-0.5 t-label-12 text-gray-700">{c.client}</p>
                    </button>
                  ))}
                </div>
                <p className="mt-2 t-label-12 leading-5 text-gray-700">
                  暂不支持新建 NeoForge 服务器，官方安装器尚不稳定。已有 NeoForge 服务器可在「全部服务器 → 导入现有服务器」中继续管理。
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-200 px-3 py-2">
                <span className="t-label-13 text-gray-1000">服务端：{serverLabel(core)}</span>
                <span className="t-label-12 text-gray-700">· {coreInfo?.client}</span>
                <button
                  className="ml-auto t-label-12 text-blue-900 hover:underline"
                  onClick={() => setCore(core === "paper" ? "vanilla" : "paper")}
                >
                  {core === "paper" ? "如需纯原版体验，可改用 Vanilla" : "换回更推荐的 Paper"}
                </button>
              </div>
            )}

            <div className={cx("flex flex-wrap items-center gap-2 rounded-lg p-2.5", javaOk ? "bg-green-800/10" : "bg-amber-700/10")}>
              <Coffee className={cx("size-4", javaOk ? "text-green-900" : "text-amber-900")} />
              <span className={cx("t-label-13", javaOk ? "text-green-900" : "text-amber-900")}>
                {javaOk
                  ? `运行环境已就绪：Java ${chosenJava?.major}`
                  : `该版本需要 Java ${requiredJava}，当前未检测到`}
              </span>
              {javaOk ? (
                <span className="t-label-12 text-gray-700">已检测到运行环境，点击下一步继续</span>
              ) : (
                <span className="ml-auto flex items-center gap-2">
                  <Button size="xs" variant="secondary" onClick={() => window.mcss.app.openExternal(JAVA_DOWNLOAD)}>
                    <ExternalLink className="size-3" />
                    下载 Java
                  </Button>
                  <Button size="xs" variant="ghost" onClick={detectJava} loading={checking}>
                    重新检测
                  </Button>
                </span>
              )}
            </div>
          </div>
        ) : null}

        {step === 2 && !createdId ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-background-200 p-3.5">
              <div className="t-label-12 text-gray-700">你会得到</div>
              <div className="mt-1 t-h-16 text-gray-1000">
                {serverLabel(core)} {mcVersion}
              </div>
              <ul className="mt-2 space-y-1">
                <li className="flex items-center gap-1.5 t-label-13 text-gray-900">
                  <Check className="size-3.5 text-green-900" />
                  {clientRequirementText(core)}
                </li>
                <li className="flex items-center gap-1.5 t-label-13 text-gray-900">
                  <Check className="size-3.5 text-green-900" />
                  需要 Java {requiredJava}：{chosenJava ? `已找到 Java ${chosenJava.major}` : "还没找到"}
                </li>
                <li className="flex items-center gap-1.5 t-label-13 text-gray-900">
                  <Check className="size-3.5 text-green-900" />
                  {intent === "mods" ? "之后可在「模组 → 资源库」中添加模组" : "之后可在「插件 → 资源库」中添加插件"}
                </li>
              </ul>
            </div>

            <Field label="服务器名称" hint="玩家在游戏内看到的名称，之后仍可修改">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="我的服务器" />
            </Field>

            {!javaOk ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-700/10 p-3">
                <AlertTriangle className="size-4 shrink-0 text-amber-900" />
                <span className="t-label-13 text-amber-900">
                  还差 Java {requiredJava}。装好之后点「重新检测」；没有 Java 服务端起不来。
                </span>
                <Button size="xs" variant="secondary" onClick={() => window.mcss.app.openExternal(JAVA_DOWNLOAD)}>
                  下载 Java {requiredJava}
                </Button>
                <Button size="xs" variant="ghost" onClick={detectJava} loading={checking}>
                  重新检测
                </Button>
              </div>
            ) : null}

            {core !== "vanilla" && builds.length === 0 ? (
              <div className="rounded-lg bg-amber-700/10 p-3 t-label-13 text-amber-900">
                {buildError
                  ? `拿不到 ${serverLabel(core)} ${mcVersion} 的构建：${buildError}`
                  : `${serverLabel(core)} 暂无 ${mcVersion} 的构建，请更换游戏版本或服务端核心。`}
              </div>
            ) : null}

            <details className="rounded-lg bg-background-200 p-3">
              <summary className="cursor-pointer t-label-13 text-gray-900">高级选项（内存 / 安装目录 / Java / 服务端版本）</summary>
              <div className="mt-3 space-y-3">
                <Field label={`最大内存 ${memoryMax} GB`} hint={totalMem ? `本机内存约 ${totalMem} GB，小型服务器 4 GB 已够用` : "小服 4G 够用"}>
                  <Slider
                    ariaLabel="最大内存"
                    min={2}
                    max={Math.max(2, Math.min(32, totalMem || 32))}
                    step={1}
                    value={[memoryMax]}
                    onValueChange={([v]) => setMemoryMax(v)}
                  />
                </Field>
                <Field label="安装目录" hint={finalDir}>
                  <div className="flex gap-2">
                    <Input value={finalDir} onChange={(e) => setDir(e.target.value)} className="font-mono text-[12px]" />
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const p = await window.mcss.dialog.openDirectory();
                        if (p) setDir(p);
                      }}
                    >
                      <FolderOpen className="size-4" />
                    </Button>
                  </div>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="其他版本">
                    <Picker value={mcVersion} onValueChange={chooseVersion} options={releaseOptions} />
                  </Field>
                  <Field label="Java 运行时">
                    <Picker
                      value={chosenJava?.path ?? ""}
                      onValueChange={setJavaOverride}
                      options={javas.map((j) => ({ value: j.path, label: `Java ${j.major ?? "?"}`, disabled: false }))}
                    />
                  </Field>
                </div>
                {core !== "vanilla" && builds.length > 0 ? (
                  <Field label={core === "fabric" ? "Fabric Loader" : "服务端版本"} hint="默认已选最新稳定版">
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
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-300">
                  <div className="h-full rounded-full bg-brand-600 transition-[width] duration-200" style={{ width: `${Math.max(2, progress.percent)}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {createdId ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-green-800/10 p-4">
              <div className="t-h-16 text-green-900">服务器已就绪</div>
              <p className="mt-1 t-label-13 text-gray-800">
                {name} · {serverLabel(core)} {mcVersion} · {finalDir}
              </p>
              <p className="mt-1 t-label-12 text-gray-700">
                下一步：启动服务器，然后生成邀请发给朋友。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => finish("open")}>
                进入主界面
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="secondary" onClick={() => finish("library")}>
                <Plug className="size-4" />
                {intent === "mods" ? "去装 Mod" : "去装插件"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogBody>

      <DialogFooter>
        {step === 0 ? (
          <Button variant="ghost" onClick={() => finish()} disabled={installing}>
            稍后再说
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={installing || Boolean(createdId)}>
            <ArrowLeft className="size-4" />
            上一步
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {createdId ? null : step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext || checking}>
              下一步
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={install}
              loading={installing}
              disabled={!chosenJava || (core !== "vanilla" && builds.length === 0) || !name.trim()}
              title={
                !chosenJava
                  ? `需要 Java ${requiredJava}`
                  : core !== "vanilla" && builds.length === 0
                    ? "这个核心/版本没有可用构建"
                    : undefined
              }
            >
              {installing ? null : <Download className="size-4" />}
              下载并安装服务端
            </Button>
          )}
        </div>
      </DialogFooter>
    </Dialog>
  );
}
