import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, FolderOpen } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, Slider } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { useConfig, makeInstance } from "@/stores/config";
import type { JavaInfo, McVersion, ServerType } from "@/lib/types";
import { safeName } from "@/lib/utils";
import { contentKindOf, serverTypeLabel } from "@/lib/config-model";
import { normalizeLoaders, pickLoader } from "@/lib/loaders";
import { CORES as GUIDE_CORES, coreMeta } from "@/lib/server-guide";
import { javaMajorFor, pickJavaFor } from "@/lib/java-compat";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateInstanceDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const addInstance = useConfig((s) => s.addInstance);

  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState("");
  const [serverType, setServerType] = useState<ServerType>("paper");
  const [build, setBuild] = useState("");
  const [dir, setDir] = useState("");
  const [memoryMin, setMemoryMin] = useState(2);
  const [memoryMax, setMemoryMax] = useState(4);
  const [javaPath, setJavaPath] = useState("");

  const [versions, setVersions] = useState<McVersion[]>([]);
  const [builds, setBuilds] = useState<string[]>([]);
  const [javas, setJavas] = useState<JavaInfo[]>([]);
  const [baseDir, setBaseDir] = useState("");

  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; percent: number; detail?: string } | null>(null);

  // 打开时加载版本清单 / Java / 默认目录
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const info = await window.mcss.app.info().catch(() => null);
      if (alive && info) setBaseDir(`${info.appData}\\instances`);
      const [list, jlist] = await Promise.all([
        window.mcss.versions.minecraft().catch(() => [] as McVersion[]),
        window.mcss.app.detectJava().catch(() => [] as JavaInfo[]),
      ]);
      if (!alive) return;
      setVersions(list);
      setJavas(jlist);
      setMcVersion((v) => v || list.find((x) => x.type === "release")?.id || list[0]?.id || "");
      setName((n) => n || "我的服务器");
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // 版本/核心联动：拉该核心在这个 MC 版本下的构建列表
  useEffect(() => {
    if (!open || !mcVersion) return;
    let alive = true;
    window.mcss.versions
      .serverBuilds(serverType, mcVersion)
      .then((raw) => {
        if (!alive) return;
        const list = normalizeLoaders(raw);
        setBuilds(list);
        setBuild((v) => pickLoader(v, list));
      })
      .catch(() => {
        if (!alive) return;
        setBuilds([]);
        setBuild("");
      });
    return () => {
      alive = false;
    };
  }, [open, mcVersion, serverType]);

  const finalDir = useMemo(() => {
    if (dir) return dir;
    const leaf = safeName(name || `${mcVersion}-${serverType}`);
    return baseDir ? `${baseDir}\\${leaf}` : "";
  }, [dir, name, mcVersion, serverType, baseDir]);

  const releaseOptions = useMemo(
    () =>
      versions
        .filter((v) => v.type === "release" || v.type === "snapshot")
        .slice(0, 240)
        .map((v) => ({
          value: v.id,
          label: `${v.id}${v.type === "release" ? "" : "（快照）"}`,
        })),
    [versions],
  );

  const kind = contentKindOf(serverType);
  const coreInfo = coreMeta(serverType);
  const activeJava = javas.find((j) => j.path === javaPath);
  const requiredJava = javaMajorFor(mcVersion);

  // 版本决定 Java：26.x 要 25、1.20.5+ 要 21、1.18+ 要 17；选错 Java 起不来
  useEffect(() => {
    if (!mcVersion || !javas.length) return;
    const picked = pickJavaFor(javas, javaMajorFor(mcVersion));
    if (picked) setJavaPath(picked.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcVersion, javas]);

  async function browseDir() {
    const picked = await window.mcss.dialog.openDirectory();
    if (picked) setDir(picked);
  }

  async function install() {
    if (!name.trim()) return toast.error("先给服务器起个名字");
    if (!mcVersion) return toast.error("先选一个 Minecraft 版本");
    if (!javaPath) return toast.error("没有找到 Java，请先手动指定");
    const need = javaMajorFor(mcVersion);
    const picked = javas.find((j) => j.path === javaPath);
    if (picked && Number(picked.major) < need) {
      return toast.error(`Minecraft ${mcVersion} 需要 Java ${need}，当前选的是 Java ${picked.major}`);
    }

    setInstalling(true);
    setProgress({ stage: "准备中", percent: 0 });
    const off = window.mcss.versions.onProgress(setProgress);
    try {
      const res = await window.mcss.versions.install({
        dir: finalDir,
        mc: mcVersion,
        serverType,
        loaderVersion: serverType === "fabric" ? build : undefined,
        build: kind === "plugin" || serverType === "forge" || serverType === "neoforge" ? build : undefined,
        javaPath,
      });
      if (!res.ok) throw new Error(res.error || "安装失败");
      const inst = makeInstance({
        name: name.trim(),
        dir: finalDir,
        mcVersion,
        serverType,
        loaderVersion: serverType === "fabric" ? build : undefined,
        buildNumber: kind === "plugin" && res.build ? Number(res.build) : undefined,
        javaPath,
        memoryMin,
        memoryMax,
        port: 25565,
      });
      await addInstance(inst);
      toast.success("服务器装好了", {
        description: `${inst.mcVersion} · ${serverTypeLabel(serverType)}${build ? ` ${build}` : ""}`,
      });
      onOpenChange(false);
      reset();
      navigate("/");
    } catch (e) {
      toast.error(`安装失败：${(e as Error).message}`);
    } finally {
      off();
      setInstalling(false);
      setProgress(null);
    }
  }

  function reset() {
    setName("");
    setDir("");
    setBuild("");
    setMemoryMin(2);
    setMemoryMax(4);
    setProgress(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !installing && onOpenChange(v)} widthClass="max-w-2xl">
      <DialogHeader
        title="新建服务器"
        desc="先选游戏版本，再选怎么玩。插件服玩家不用装东西；模组服朋友也要装同样的模组。"
      />
      <DialogBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="服务器名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：和朋友一起玩" />
          </Field>
          <Field label="Minecraft 版本">
            <Picker
              value={mcVersion}
              onValueChange={setMcVersion}
              options={releaseOptions.length ? releaseOptions : [{ value: "", label: "加载中…" }]}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="服务端核心"
            hint={
              coreInfo
                ? `${coreInfo.client}。${coreInfo.caveat}${
                    kind === "mod" && mcVersion.startsWith("26.")
                      ? "；26.x 的模组还少，建议 1.21.11 或 1.21.1 + Fabric"
                      : ""
                  }`
                : "决定能装插件还是模组"
            }
          >
            <Picker
              value={serverType}
              onValueChange={(v) => setServerType(v as ServerType)}
              options={GUIDE_CORES.filter((c) => c.supported !== false).map((c) => ({
                value: c.type,
                label: `${c.label} — ${c.tagline}`,
              }))}
            />
            <p className="mt-1 t-label-12 text-gray-700">
              NeoForge 新建暂不支持；已有 NeoForge 服务器请用「导入」。
            </p>
          </Field>
          <Field
            label={kind === "plugin" ? "构建号" : "Fabric Loader"}
            hint={
              kind === "plugin"
                ? build
                  ? `Paper/Purpur 的构建，越新越好`
                  : builds.length
                    ? "选一个构建"
                    : "这个版本还没有构建"
                : serverType === "vanilla"
                  ? "原版服务端不需要"
                  : "默认已选稳定版"
            }
          >
            <Picker
              disabled={serverType === "vanilla" || builds.length === 0}
              value={build}
              onValueChange={setBuild}
              options={builds.length ? builds.map((l) => ({ value: l, label: l })) : [{ value: "", label: "—" }]}
            />
          </Field>
        </div>

        <Field label="安装目录" hint={finalDir || "会在应用数据目录下按名称创建"}>
          <div className="flex gap-2">
            <Input value={finalDir} onChange={(e) => setDir(e.target.value)} className="font-mono text-[12px]" />
            <Button variant="secondary" onClick={browseDir}>
              <FolderOpen className="size-4" />
            </Button>
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`初始内存 ${memoryMin} GB`}>
            <Slider
              ariaLabel="初始内存"
              min={1}
              max={32}
              step={1}
              value={[memoryMin]}
              onValueChange={([v]) => setMemoryMin(Math.min(v, memoryMax))}
            />
          </Field>
          <Field label={`最大内存 ${memoryMax} GB`}>
            <Slider
              ariaLabel="最大内存"
              min={1}
              max={32}
              step={1}
              value={[memoryMax]}
              onValueChange={([v]) => setMemoryMax(Math.max(v, memoryMin))}
            />
          </Field>
        </div>

        <Field
          label="Java 运行时"
          hint={
            activeJava
              ? `这个版本需要 Java ${requiredJava}；当前选的是 Java ${activeJava.major ?? "?"}${Number(activeJava.major ?? 0) < requiredJava ? "（不够）" : ""}`
              : javas.length
                ? "自动探测到的 Java 运行时"
                : "没探测到，点右侧手动指定"
          }
        >
          <div className="flex gap-2">
            <Picker
              className="flex-1"
              value={javaPath}
              onValueChange={setJavaPath}
              options={javas.length ? javas.map((j) => ({ value: j.path, label: `${j.path}（Java ${j.major ?? "?"}）` })) : [{ value: "", label: "未找到 Java" }]}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                const p = await window.mcss.app.pickJava();
                if (p) setJavaPath(p);
              }}
            >
              指定
            </Button>
          </div>
        </Field>

        {progress ? (
          <div className="rounded-lg bg-background-200 p-3">
            <div className="mb-2 flex items-center justify-between t-label-12 text-gray-800">
              <span>{progress.stage}</span>
              <span className="t-mono-12">{progress.detail || `${progress.percent}%`}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-300">
              <div
                className="h-full rounded-full bg-blue-700 transition-all"
                style={{ width: `${Math.max(2, progress.percent)}%` }}
              />
            </div>
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={installing}>
          取消
        </Button>
        <Button
          onClick={install}
          loading={installing}
          disabled={!javaPath || (serverType !== "vanilla" && builds.length === 0)}
          title={
            !javaPath
              ? "先选一个 Java"
              : serverType !== "vanilla" && builds.length === 0
                ? "这个核心/版本没有可用构建"
                : undefined
          }
        >
          {installing ? null : <Download className="size-4" />}
          下载并创建
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
