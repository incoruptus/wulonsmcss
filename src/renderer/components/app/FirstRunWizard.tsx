import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Coffee, Download, FolderOpen, Play, Puzzle, Wifi } from "lucide-react";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, Slider } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Badge, SegmentedControl } from "@/components/ui/misc";
import { useConfig, makeInstance } from "@/stores/config";
import type { JavaInfo, McVersion, ServerType } from "@/lib/types";
import { cx, safeName } from "@/lib/utils";
import { normalizeLoaders, pickLoader } from "@/lib/loaders";

/** 和「新建实例」对话框保持同一份核心列表，别让首次向导比它少东西 */
const CORE_OPTIONS: { value: ServerType; label: string }[] = [
  { value: "paper", label: "Paper（插件服·推荐）" },
  { value: "purpur", label: "Purpur" },
  { value: "fabric", label: "Fabric（模组服）" },
  { value: "neoforge", label: "NeoForge" },
  { value: "forge", label: "Forge" },
  { value: "vanilla", label: "原版" },
];

const CORE_HINTS: Record<ServerType, string> = {
  paper: "插件服（水桶系）：玩家用原版客户端就能进",
  purpur: "Paper 的增强版，多几百个玩法开关",
  fabric: "轻量模组服，性能模组首选",
  neoforge: "现代整合包的标准，装的时候要跑官方安装器",
  forge: "老整合包用得多（1.12–1.19）",
  vanilla: "原版服务端，不装任何东西",
};

const STEPS = ["运行环境", "服务器版本", "开服"] as const;

export function FirstRunWizard({ open, onDone }: { open: boolean; onDone: () => void }) {
  const navigate = useNavigate();
  const addInstance = useConfig((s) => s.addInstance);

  const [step, setStep] = useState(0);
  const [javas, setJavas] = useState<JavaInfo[]>([]);
  const [javaPath, setJavaPath] = useState("");
  const [checking, setChecking] = useState(false);

  const [versions, setVersions] = useState<McVersion[]>([]);
  const [mcVersion, setMcVersion] = useState("");
  const [loader, setLoader] = useState<ServerType>("paper");
  const [loaders, setLoaders] = useState<string[]>([]);
  const [loaderVersion, setLoaderVersion] = useState("");
  const [name, setName] = useState("");
  const [baseDir, setBaseDir] = useState("");
  const [dir, setDir] = useState("");
  const [memoryMax, setMemoryMax] = useState(8);

  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent: number; detail?: string } | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // 打开时做环境探测
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      setChecking(true);
      const [info, list, js] = await Promise.all([
        window.mcss.app.info().catch(() => null),
        window.mcss.versions.minecraft().catch(() => [] as McVersion[]),
        window.mcss.app.detectJava().catch(() => [] as JavaInfo[]),
      ]);
      if (!alive) return;
      if (info) setBaseDir(`${info.appData}\\instances`);
      setVersions(list);
      setJavas(js);
      const best = js.find((j) => (j.major ?? 0) >= 21) ?? js[0];
      setJavaPath(best?.path ?? "");
      setMcVersion((v) => v || list.find((x) => x.type === "release")?.id || "");
      setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !mcVersion) return;
    let alive = true;
    window.mcss.versions
      .serverBuilds(loader, mcVersion)
      .then((raw) => {
        if (!alive) return;
        const list = normalizeLoaders(raw);
        setLoaders(list);
        setLoaderVersion((v) => pickLoader(v, list));
      })
      .catch(() => {
        if (alive) setLoaders([]);
      });
    return () => {
      alive = false;
    };
  }, [open, mcVersion, loader]);

  const finalDir = useMemo(() => {
    if (dir) return dir;
    return baseDir ? `${baseDir}\\${safeName(name || `${mcVersion}-${loader}`)}` : "";
  }, [dir, name, mcVersion, loader, baseDir]);

  const releaseOptions = useMemo(
    () =>
      versions
        .filter((v) => v.type === "release" || v.type === "snapshot")
        .slice(0, 240)
        .map((v) => ({ value: v.id, label: `${v.id}${v.type === "release" ? "" : "（快照）"}` })),
    [versions],
  );

  async function install() {
    if (!javaPath) return toast.error("先选一个 Java 运行时");
    if (!name.trim()) return toast.error("给服务器起个名字");
    if (!mcVersion) return toast.error("选一个 Minecraft 版本");
    setInstalling(true);
    setProgress({ stage: "准备中", percent: 0 });
    const off = window.mcss.versions.onProgress(setProgress);
    try {
      const res = await window.mcss.versions.install({
        dir: finalDir,
        mc: mcVersion,
        serverType: loader,
        loaderVersion: loader === "fabric" ? loaderVersion : undefined,
        build: loader === "paper" || loader === "purpur" || loader === "forge" || loader === "neoforge" ? loaderVersion : undefined,
        javaPath,
      });
      if (!res.ok) throw new Error(res.error || "安装失败");
      const inst = makeInstance({
        name: name.trim(),
        dir: finalDir,
        mcVersion,
        serverType: loader,
        loaderVersion: loader === "fabric" ? loaderVersion : undefined,
        javaPath,
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

  function finish(then?: "library" | "network" | "open") {
    onDone();
    if (then === "library") navigate(createdId ? `/instances/${createdId}/content?view=browse` : "/instances");
    else if (then === "network") navigate("/network");
    else if (then === "open" && createdId) navigate("/");
  }

  const canNext = step === 0 ? Boolean(javaPath) : step === 1 ? Boolean(mcVersion && name.trim()) : true;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !installing && finish()} widthClass="max-w-2xl">
      <div className="border-b border-gray-300 px-5 py-4">
        <div className="t-h-20 text-gray-1000">欢迎使用 Wulon&apos;s MCSS</div>
        <p className="t-label-13 mt-1 text-gray-800">三步开一个服务器。不想现在做也没关系，右上角关掉即可，之后随时能新建。</p>
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
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Coffee className="size-4 text-gray-800" />
              <span className="t-h-14 text-gray-1000">检测到的 Java</span>
              <Badge variant={javas.length ? "green" : "amber"} size="sm">
                {checking ? "检测中" : javas.length ? `${javas.length} 个` : "没找到"}
              </Badge>
              <Button
                size="xs"
                variant="secondary"
                className="ml-auto"
                onClick={async () => {
                  setChecking(true);
                  const js = await window.mcss.app.detectJava().catch(() => []);
                  setJavas(js);
                  if (!javaPath && js[0]) setJavaPath(js[0].path);
                  setChecking(false);
                }}
              >
                重新检测
              </Button>
            </div>

            {javas.length === 0 ? (
              <div className="rounded-lg bg-amber-700/10 p-3 t-label-12 text-amber-900">
                没有找到 Java。Minecraft 26.x 需要 Java 21+，点下面的「手动指定」选中 <span className="t-mono-12">javaw.exe</span>。
              </div>
            ) : null}

            <div className="space-y-1.5">
              {javas.map((j) => (
                <label
                  key={j.path}
                  className={cx(
                    "flex cursor-pointer items-center gap-2 rounded-lg p-2.5 transition-colors",
                    javaPath === j.path ? "bg-gray-100" : "hover:bg-gray-100",
                  )}
                >
                  <input type="radio" checked={javaPath === j.path} onChange={() => setJavaPath(j.path)} />
                  <span className="t-label-13 text-gray-1000">Java {j.major ?? "?"}</span>
                  <span className="t-mono-12 truncate text-gray-700">{j.path}</span>
                </label>
              ))}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const p = await window.mcss.app.pickJava();
                if (p) {
                  setJavaPath(p);
                  setJavas((list) => (list.some((j) => j.path === p) ? list : [...list, { path: p }]));
                }
              }}
            >
              手动指定 Java
            </Button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="服务器名称">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="和朋友一起玩" />
              </Field>
              <Field label="Minecraft 版本">
                <Picker
                  value={mcVersion}
                  onValueChange={setMcVersion}
                  options={releaseOptions.length ? releaseOptions : [{ value: "", label: "加载中…" }]}
                />
              </Field>
            </div>

            <Field label="服务端核心" hint={CORE_HINTS[loader]}>
              <Picker value={loader} onValueChange={(v) => setLoader(v as ServerType)} options={CORE_OPTIONS} />
            </Field>

            {loader !== "vanilla" ? (
              <Field label={loader === "fabric" ? "Fabric Loader" : "核心版本"}>
                <Picker
                  value={loaderVersion}
                  onValueChange={setLoaderVersion}
                  options={loaders.length ? loaders.map((l) => ({ value: l, label: l })) : [{ value: "", label: "—" }]}
                />
              </Field>
            ) : null}

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

            <Field label={`最大内存 ${memoryMax} GB`} hint="小服 4G 够用；装了大型 Mod 建议 8G 以上">
              <Slider ariaLabel="最大内存" min={2} max={32} step={1} value={[memoryMax]} onValueChange={([v]) => setMemoryMax(v)} />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            {createdId ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-green-800/10 p-3">
                  <div className="t-label-13 font-medium text-green-900">服务器已就绪</div>
                  <div className="t-label-12 mt-0.5 text-gray-800">
                    {name} · {mcVersion} · {loader}
                    {loaderVersion ? ` ${loaderVersion}` : ""} · {finalDir}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button variant="secondary" onClick={() => finish("open")}>
                    <Play className="size-4" />
                    进入实例
                  </Button>
                  <Button variant="secondary" onClick={() => finish("library")}>
                    <Puzzle className="size-4" />
                    装点 Mod
                  </Button>
                  <Button variant="secondary" onClick={() => finish("network")}>
                    <Wifi className="size-4" />
                    配置联机
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="t-label-13 text-gray-800">
                  会把 {loader === "fabric" ? "Fabric" : "原版"} {mcVersion} 的服务端下载到：
                </p>
                <p className="t-mono-12 break-all rounded-lg bg-background-200 p-2.5 text-gray-900">{finalDir}</p>
                {progress ? (
                  <div className="rounded-lg bg-background-200 p-3">
                    <div className="mb-2 flex items-center justify-between t-label-12 text-gray-800">
                      <span>{progress.stage}</span>
                      <span className="t-mono-12">{progress.detail || `${progress.percent}%`}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-300">
                      <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${Math.max(2, progress.percent)}%` }} />
                    </div>
                  </div>
                ) : null}
                <Button onClick={install} loading={installing} size="lg">
                  {installing ? null : <Download className="size-4" />}
                  下载并安装服务端
                </Button>
              </>
            )}
          </div>
        ) : null}
      </DialogBody>

      <DialogFooter>
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={installing}>
            <ArrowLeft className="size-4" />
            上一步
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => finish()} disabled={installing}>
            稍后再说
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {step < 2 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext || installing}>
              下一步
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => finish("open")} disabled={!createdId}>
              进入主界面
            </Button>
          )}
        </div>
      </DialogFooter>
    </Dialog>
  );
}
