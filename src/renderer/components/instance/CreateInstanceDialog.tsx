import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, FolderOpen, Sparkles } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, Slider } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/misc";
import { useConfig, makeInstance } from "@/stores/config";
import type { JavaInfo, Loader, McVersion } from "@/lib/types";
import { safeName } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateInstanceDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const addInstance = useConfig((s) => s.addInstance);

  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState("");
  const [loader, setLoader] = useState<Loader>("fabric");
  const [loaderVersion, setLoaderVersion] = useState("");
  const [dir, setDir] = useState("");
  const [memoryMin, setMemoryMin] = useState(2);
  const [memoryMax, setMemoryMax] = useState(4);
  const [javaPath, setJavaPath] = useState("");

  const [versions, setVersions] = useState<McVersion[]>([]);
  const [loaders, setLoaders] = useState<string[]>([]);
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
      const best = jlist.find((j) => (j.major ?? 0) >= 21) ?? jlist[0];
      setJavaPath((p) => p || best?.path || "");
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // 版本/加载器联动
  useEffect(() => {
    if (!open || !mcVersion || loader !== "fabric") return;
    let alive = true;
    window.mcss.versions.fabricLoaders(mcVersion).then((l) => {
      if (!alive) return;
      setLoaders(l);
      setLoaderVersion((v) => (l.includes(v) ? v : (l[0] ?? "")));
    }).catch(() => {
      if (alive) setLoaders([]);
    });
    return () => {
      alive = false;
    };
  }, [open, mcVersion, loader]);

  const finalDir = useMemo(() => {
    if (dir) return dir;
    const leaf = safeName(name || `${mcVersion}-${loader}`);
    return baseDir ? `${baseDir}\\${leaf}` : "";
  }, [dir, name, mcVersion, loader, baseDir]);

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

  async function browseDir() {
    const picked = await window.mcss.dialog.openDirectory();
    if (picked) setDir(picked);
  }

  async function install() {
    if (!name.trim()) return toast.error("先给服务器起个名字");
    if (!mcVersion) return toast.error("先选一个 Minecraft 版本");
    if (!javaPath) return toast.error("没有找到 Java，请先手动指定");

    setInstalling(true);
    setProgress({ stage: "准备中", percent: 0 });
    const off = window.mcss.versions.onProgress(setProgress);
    try {
      const res = await window.mcss.versions.install({
        dir: finalDir,
        mc: mcVersion,
        loader,
        loaderVersion: loader === "fabric" ? loaderVersion : undefined,
      });
      if (!res.ok) throw new Error(res.error || "安装失败");
      const inst = makeInstance({
        name: name.trim(),
        dir: finalDir,
        mcVersion,
        loader,
        loaderVersion: loader === "fabric" ? loaderVersion : undefined,
        javaPath,
        memoryMin,
        memoryMax,
        port: 25565,
      });
      await addInstance(inst);
      toast.success("服务器装好了", { description: `${inst.mcVersion} · ${inst.loader}${inst.loaderVersion ? ` ${inst.loaderVersion}` : ""}` });
      onOpenChange(false);
      reset();
      navigate(`/instances/${inst.id}`);
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
    setLoaderVersion("");
    setMemoryMin(2);
    setMemoryMax(4);
    setProgress(null);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !installing && onOpenChange(v)} widthClass="max-w-2xl">
      <DialogHeader
        title="新建服务器实例"
        desc="选版本 → 选加载器 → 下载服务端，装好即可开服。Mod 可以在创建后从「资源库」加。"
      />
      <DialogBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="服务器名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：和朋友一起玩" />
          </Field>
          <Field label="Minecraft 版本">
            <Select
              value={mcVersion}
              onChange={(e) => setMcVersion(e.target.value)}
              options={releaseOptions.length ? releaseOptions : [{ value: "", label: "加载中…" }]}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="服务端核心">
            <SegmentedControl
              grow
              value={loader}
              onValueChange={(v) => setLoader(v as Loader)}
              options={[
                { value: "fabric", label: "Fabric（支持 Mod）" },
                { value: "vanilla", label: "原版" },
              ]}
            />
          </Field>
          <Field label="Fabric Loader" hint={loader === "fabric" ? "默认已选稳定版" : "原版服务端不需要"}>
            <Select
              disabled={loader !== "fabric" || loaders.length === 0}
              value={loaderVersion}
              onChange={(e) => setLoaderVersion(e.target.value)}
              options={loaders.length ? loaders.map((l) => ({ value: l, label: l })) : [{ value: "", label: "—" }]}
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

        <Field label="Java 运行时" hint={javas.length ? "自动探测到的 Java 运行时" : "没探测到，点右侧手动指定"}>
          <div className="flex gap-2">
            <Select
              className="flex-1"
              value={javaPath}
              onChange={(e) => setJavaPath(e.target.value)}
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
        <Button onClick={install} loading={installing}>
          {installing ? null : <Download className="size-4" />}
          下载并创建
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
