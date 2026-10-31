import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, FolderOpen, Package, RefreshCw, Server, ShieldAlert } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Slider } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Badge } from "@/components/ui/misc";
import { useConfig, makeInstance } from "@/stores/config";
import type { ClientScan, ClientVersion, ModMeta, ServerType } from "@/lib/types";
import { safeName } from "@/lib/utils";
import { javaMajorFor, pickJavaFor } from "@/lib/java-compat";
import { syncClientMods } from "@/lib/client-mods";
import { serverTypeLabel } from "@/lib/config-model";

const CORE_LABEL: Record<string, string> = {
  fabric: "Fabric",
  forge: "Forge",
  vanilla: "Vanilla",
  paper: "Paper",
};

function loaderText(loader: string, version: string): string {
  if (loader === "vanilla") return "原版";
  return `${loader[0].toUpperCase()}${loader.slice(1)}${version ? ` ${version}` : ""}`;
}

export function CreateServerFromClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const addInstance = useConfig((s) => s.addInstance);
  const profile = useConfig((s) => s.cfg.clientProfiles[0]);

  const [dir, setDir] = useState("");
  const [scanDir, setScanDir] = useState("");
  const [scan, setScan] = useState<ClientScan | null>(null);
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanNonce, setScanNonce] = useState(0);
  const [versionId, setVersionId] = useState("");
  const [core, setCore] = useState<ServerType>("paper");
  const [name, setName] = useState("");
  const [port, setPort] = useState("25565");
  const [memoryMax, setMemoryMax] = useState(4);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [stage, setStage] = useState("");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!open) return;
    setScan(null);
    setScanError("");
    setScanning(false);
    setName("");
    setSelected(new Set());
    void window.mcss.app
      .info()
      .then((info) => setDir((d) => d || profile?.dir || info.minecraftDir || ""))
      .catch(() => setDir((d) => d || profile?.dir || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setScanDir(dir), 350);
    return () => clearTimeout(timer);
  }, [dir]);

  useEffect(() => {
    if (!open || !scanDir) return;
    let alive = true;
    setScanning(true);
    setScanError("");
    window.mcss.client
      .scan(scanDir)
      .then((res) => {
        if (!alive) return;
        if ("error" in res) {
          setScan(null);
          setScanError(res.error);
          return;
        }
        setScan(res);
        const rec = res.recommended;
        setVersionId(rec?.id || "");
        if (rec) {
          setName((n) => n || `${rec.name || "我的"}服务器`);
          setCore(rec.loader === "fabric" ? "fabric" : rec.loader === "forge" ? "forge" : "paper");
          setSelected(new Set(res.mods.filter((m) => m.environment !== "client").map((m) => m.file)));
        }
      })
      .catch((e: Error) => {
        if (alive) setScanError(e.message);
      })
      .finally(() => {
        if (alive) setScanning(false);
      });
    return () => {
      alive = false;
    };
  }, [open, scanDir, scanNonce]);

  const current = useMemo<ClientVersion | null>(
    () => scan?.versions.find((v) => v.id === versionId) ?? null,
    [scan, versionId],
  );

  useEffect(() => {
    if (!current) return;
    setCore(current.loader === "fabric" ? "fabric" : current.loader === "forge" ? "forge" : "paper");
  }, [current?.id]);
  const unsupported = current ? ["neoforge", "quilt"].includes(current.loader) : false;
  const selectedMods = (scan?.mods ?? []).filter((m) => selected.has(m.file));
  const clientOnly = selectedMods.filter((m) => m.environment === "client").length;

  function toggle(file: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(file);
      else next.delete(file);
      return next;
    });
  }

  async function create() {
    if (!scan || !current) return toast.error("先扫描一个客户端目录");
    if (!name.trim()) return toast.error("给服务器起个名字");
    if (unsupported) {
      return toast.error(`${loaderText(current.loader, current.loaderVersion)} 客户端暂不支持一键开服`);
    }
    const targetCore: ServerType =
      current.loader === "fabric" ? "fabric" : current.loader === "forge" ? "forge" : core;
    if (targetCore === "paper" && !["vanilla"].includes(current.loader)) {
      return toast.error("这个客户端带加载器，不能直接套 Paper");
    }
    if (clientOnly) {
      const ok = window.confirm(
        `选中的 Mod 里有 ${clientOnly} 个标记为「仅客户端」。服务端通常不需要它们，可能导致起不来。仍然继续？`,
      );
      if (!ok) return;
    }

    setCreating(true);
    setPercent(0);
    setStage("检查 Java…");
    const unsub = window.mcss.versions.onProgress((p) => {
      setStage(p.stage);
      setPercent(p.percent);
    });
    try {
      const info = await window.mcss.app.info();
      const javas = await window.mcss.app.detectJava().catch(() => []);
      const java = pickJavaFor(javas, javaMajorFor(current.mcVersion));
      if (!java) throw new Error(`这个版本需要 Java ${javaMajorFor(current.mcVersion)}，先装好再来`);

      const builds = await window.mcss.versions.serverBuilds(targetCore, current.mcVersion).catch(() => []);
      const chosenBuild =
        targetCore === "fabric"
          ? current.loaderVersion || builds[0]
          : targetCore === "forge"
            ? current.loaderVersion || builds[0]
            : builds[0];
      if (targetCore !== "vanilla" && !chosenBuild) {
        throw new Error(`${serverTypeLabel(targetCore)} ${current.mcVersion} 没有可用构建（网络或版本问题）`);
      }

      const base = `${info.appData}\\instances\\${safeName(name)}`;
      let serverDir = base;
      let seq = 2;
      while (await window.mcss.fs.exists(serverDir)) serverDir = `${base}-${seq++}`;

      setStage("创建服务端目录…");
      const inst = makeInstance({
        name: name.trim(),
        dir: serverDir,
        mcVersion: current.mcVersion,
        serverType: targetCore,
        loaderVersion: targetCore === "fabric" ? chosenBuild : undefined,
        buildNumber: targetCore === "paper" ? Number(chosenBuild) || undefined : undefined,
        javaPath: java.path,
        memoryMin: Math.min(2, memoryMax),
        memoryMax,
        port: Number(port) || 25565,
      });

      const install = await window.mcss.versions.install({
        dir: serverDir,
        mc: current.mcVersion,
        serverType: targetCore,
        loaderVersion: targetCore === "fabric" ? chosenBuild : undefined,
        build: targetCore === "paper" || targetCore === "forge" ? chosenBuild : undefined,
        javaPath: java.path,
      });
      if (!install.ok) throw new Error(install.error || "服务端安装失败");

      await addInstance(inst);
      setStage("同步客户端 Mod…");
      setPercent(88);
      const sync = selectedMods.length ? await syncClientMods(serverDir, selectedMods) : null;
      if (sync && Object.keys(sync.index).length) {
        await useConfig.getState().patch({
          modrinthIndex: { ...(useConfig.getState().cfg.modrinthIndex ?? {}), ...sync.index },
        });
      }
      const synced = sync ? sync.downloaded.length + sync.copied.length : 0;
      toast.success("服务器已创建", {
        description: [
          `${inst.name} · ${current.mcVersion} · ${serverTypeLabel(targetCore)}`,
          synced ? `已同步 ${synced} 个 Mod` : "没有选 Mod",
          sync?.failed.length ? `${sync.failed.length} 个失败` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (sync?.failed.length) {
        toast.error(`${sync.failed.length} 个 Mod 没同步成功`, {
          description: sync.failed.map((f) => `${f.file}：${f.error}`).slice(0, 3).join("；"),
        });
      }
      onOpenChange(false);
      navigate(`/instances/${inst.id}`);
    } catch (e) {
      toast.error("开服失败", { description: (e as Error).message });
    } finally {
      unsub();
      setCreating(false);
      setStage("");
      setPercent(0);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (creating ? undefined : onOpenChange(v))} widthClass="max-w-2xl">
      <DialogHeader
        title="用现有客户端开服"
        desc="不用重新想版本和核心：先读你现在的客户端，再把需要的 Mod 下到服务端。"
      />
      <DialogBody className="space-y-3">
        <Field label="客户端目录" hint="指到 .minecraft 那一层；扫描不会改任何文件">
          <div className="flex gap-2">
            <Input value={dir} onChange={(e) => setDir(e.target.value)} className="font-mono text-[12px]" placeholder="C:\\Users\\你\\AppData\\Roaming\\.minecraft" />
            <Button
              variant="secondary"
              onClick={async () => {
                const picked = await window.mcss.dialog.openDirectory();
                if (picked) setDir(picked);
                else void window.mcss.client.scan(dir).catch(() => {});
              }}
            >
              <FolderOpen className="size-4" />
            </Button>
            <Button variant="secondary" loading={scanning} onClick={() => setScanNonce((n) => n + 1)}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </Field>

        {scanError ? (
          <div className="rounded-lg bg-amber-700/10 p-3 t-label-13 text-amber-900">{scanError}</div>
        ) : null}

        {scan && scan.versions.length === 0 ? (
          <div className="rounded-lg bg-amber-700/10 p-3 t-label-13 text-amber-900">
            这个目录里没找到 versions/。指到 .minecraft 那一层，或者换一个已经有游戏版本的客户端。
          </div>
        ) : null}

        {scan && scan.versions.length > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="用哪个客户端版本" hint={`识别到 ${scan.versions.length} 个版本`}>
                <Picker
                  value={versionId}
                  onValueChange={setVersionId}
                  options={scan.versions.map((v) => ({
                    value: v.id,
                    label: `${v.name} · ${v.mcVersion} ${loaderText(v.loader, v.loaderVersion)}`,
                  }))}
                />
              </Field>
              <Field label="服务端核心" hint={current?.loader === "vanilla" ? "原版客户端建议 Paper；玩家仍然不用装东西" : "跟随客户端加载器"}>
                {current?.loader === "vanilla" ? (
                  <Picker
                    value={core}
                    onValueChange={(v) => setCore(v as ServerType)}
                    options={[
                      { value: "paper", label: "Paper（推荐）" },
                      { value: "vanilla", label: "Vanilla" },
                    ]}
                  />
                ) : (
                  <div className="flex h-9 items-center rounded-md bg-background-100 px-3 t-label-13 text-gray-1000 shadow-geist-border">
                    {CORE_LABEL[current?.loader ?? ""] ?? current?.loader}
                  </div>
                )}
              </Field>
            </div>

            {current && unsupported ? (
              <div className="flex items-start gap-2 rounded-lg bg-amber-700/10 p-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-900" />
                <p className="t-label-13 leading-6 text-amber-900">
                  {loaderText(current.loader, current.loaderVersion)} 客户端暂不支持一键开服。
                  已有 {loaderText(current.loader, current.loaderVersion)} 服务端可以用「全部实例 → 导入」接进来；
                  或者换一个 Fabric 客户端版本。
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="服务器名称">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="端口" hint="默认 25565">
                <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label={`最大内存 ${memoryMax}G`}>
                <Slider min={2} max={16} step={1} value={[memoryMax]} onValueChange={([v]) => setMemoryMax(v)} />
              </Field>
            </div>

            <div className="rounded-xl bg-background-100 p-3 shadow-geist-border">
              <div className="flex flex-wrap items-center gap-2">
                <Package className="size-4 text-gray-800" />
                <span className="t-label-14 font-medium text-gray-1000">客户端 Mod</span>
                <span className="t-label-12 text-gray-700">
                  {scan.mods.length} 个 · 勾选要下到服务端的
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() =>
                    setSelected(
                      selected.size === scan.mods.filter((m) => m.environment !== "client").length
                        ? new Set()
                        : new Set(scan.mods.filter((m) => m.environment !== "client").map((m) => m.file)),
                    )
                  }
                >
                  全选服务端可用
                </Button>
              </div>
              <div className="mt-2 max-h-[30vh] space-y-1 overflow-y-auto scroll-thin">
                {scan.mods.length === 0 ? (
                  <p className="t-label-12 py-3 text-gray-700">这个客户端没有 Mod，创建后就是一个干净服务端。</p>
                ) : (
                  scan.mods.map((m) => (
                    <ModRow
                      key={`${m.file}-${m.id}`}
                      mod={m}
                      checked={selected.has(m.file)}
                      onCheckedChange={(v) => toggle(m.file, v)}
                    />
                  ))
                )}
              </div>
            </div>

            {selectedMods.length ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-200 px-3 py-2 t-label-12 text-gray-700">
                <CheckCircle2 className="size-3.5 text-green-900" />
                将同步 {selectedMods.length} 个 Mod；匹配不到 Modrinth 的会直接复制你客户端的 jar。
                {clientOnly ? <span className="text-amber-900">其中 {clientOnly} 个标记仅客户端，请确认。</span> : null}
              </div>
            ) : null}

            {creating ? (
              <div>
                <div className="flex justify-between t-label-12 text-gray-700">
                  <span>{stage || "准备中…"}</span>
                  <span>{percent}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full bg-brand-600 transition-[width] duration-200" style={{ width: `${percent}%` }} />
                </div>
              </div>
            ) : null}
          </>
        ) : scanning ? (
          <div className="py-6 t-label-13 text-gray-700">正在扫描客户端…</div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={creating}>
          取消
        </Button>
        <Button onClick={create} loading={creating} disabled={!scan || !current || unsupported}>
          <Server className="size-4" />
          创建服务端并同步
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function ModRow({
  mod,
  checked,
  onCheckedChange,
}: {
  mod: ModMeta;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const env = mod.environment === "client" ? "仅客户端" : mod.environment === "server" ? "服务端" : "双端";
  return (
    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100">
      <Checkbox checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
      <span className="min-w-0 flex-1">
        <span className="t-label-13 block truncate text-gray-1000">{mod.name}</span>
        <span className="t-mono-12 block truncate text-gray-700">{mod.file}</span>
      </span>
      <Badge variant={mod.environment === "client" ? "amber" : mod.environment === "server" ? "blue" : "gray"} size="sm">
        {env}
      </Badge>
      <span className="t-label-12 shrink-0 text-gray-700">{mod.version || "—"}</span>
    </label>
  );
}
