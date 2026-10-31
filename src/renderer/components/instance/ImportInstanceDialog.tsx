import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FolderSearch, Import } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Badge } from "@/components/ui/misc";
import { useConfig, makeInstance } from "@/stores/config";
import { serverTypeLabel } from "@/lib/config-model";
import type { McVersion, ServerType } from "@/lib/types";
import { javaMajorFor, pickJavaFor } from "@/lib/java-compat";

type Detected = Awaited<ReturnType<typeof window.mcss.versions.detectServer>>;

function leafOf(dir: string): string {
  const parts = dir.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || "导入的服务器";
}

/**
 * 导入既有服务器
 * ------------------------------------------------------------
 * 服主真正的痛点往往不是"不会装"，而是"我已经有一个服了，能不能直接管"。
 * 后端早就能认核心类型了（.mcss-server.json / libraries / plugins / 特征文件名），
 * 这里只是把它接上一个对话框：选目录 → 猜出核心与版本 → 建实例。
 */
export function ImportInstanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const addInstance = useConfig((s) => s.addInstance);

  const [dir, setDir] = useState("");
  const [detected, setDetected] = useState<Detected>(null);
  const [probing, setProbing] = useState(false);
  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState("");
  const [port, setPort] = useState("25565");
  const [serverType, setServerType] = useState<ServerType>("fabric");
  const [versions, setVersions] = useState<McVersion[]>([]);

  useEffect(() => {
    if (!open) return;
    void window.mcss.versions
      .minecraft()
      .then((list) => setVersions(list.filter((v) => v.type === "release")))
      .catch(() => {});
  }, [open]);

  async function pick() {
    const picked = await window.mcss.dialog.openDirectory();
    if (!picked) return;
    setDir(picked);
    setName(leafOf(picked));
    setProbing(true);
    try {
      const res = await window.mcss.versions.detectServer(picked).catch(() => null);
      setDetected(res);
      if (res) {
        setServerType(res.serverType);
        if (res.mc) setMcVersion(res.mc);
      }
      // 端口从 server.properties 里读，省得用户再填
      const props = await window.mcss.props.read(`${picked}\\server.properties`).catch(() => null);
      if (props?.["server-port"]) setPort(String(props["server-port"]));
    } finally {
      setProbing(false);
    }
  }

  async function create() {
    if (!dir) return toast.error("先选一个服务器目录");
    if (!mcVersion) return toast.error("请选择该服务器使用的 Minecraft 版本，无法自动识别时需手动确认");
    const javas = await window.mcss.app.detectJava().catch(() => []);
    const java = pickJavaFor(javas, javaMajorFor(mcVersion));
    if (!java) return toast.error(`该服务器需要 Java ${javaMajorFor(mcVersion)}，可先安装再导入，或先导入后在设置中指定`);
    const inst = makeInstance({
      name: name.trim() || leafOf(dir),
      dir,
      mcVersion,
      serverType,
      loaderVersion: detected?.loaderVersion,
      javaPath: java.path,
      port: Number(port) || 25565,
      importedFrom: dir,
    });
    await addInstance(inst);
    toast.success("已导入", { description: `${inst.name} · ${serverTypeLabel(serverType)} · ${inst.mcVersion}` });
    onOpenChange(false);
    reset();
    navigate("/");
  }

  function reset() {
    setDir("");
    setDetected(null);
    setName("");
    setPort("25565");
    setMcVersion("");
  }

  const confidence = detected?.confidence === "high" ? "确认" : detected?.confidence === "medium" ? "较可信" : "猜的";

  return (
    <Dialog open={open} onOpenChange={(v) => (probing ? undefined : onOpenChange(v))} widthClass="max-w-xl">
      <DialogHeader
        title="导入现有服务器"
        desc="已有服务器时，选择服务器目录即可。程序会根据目录特征判断服务端核心类型，不会修改其中的文件。"
      />
      <DialogBody className="space-y-4">
        <Field label="服务器目录" hint={dir || "即包含 server.properties、world、plugins 或 mods 的目录"}>
          <div className="flex gap-2">
            <Input value={dir} onChange={(e) => setDir(e.target.value)} className="font-mono text-[12px]" placeholder="D:\Servers\我的服" />
            <Button variant="secondary" onClick={pick} loading={probing}>
              <FolderSearch className="size-4" />
              选择
            </Button>
          </div>
        </Field>

        {detected ? (
          <div className="rounded-lg bg-background-200 p-3">
            <div className="flex items-center gap-2">
              <Badge variant="blue" size="sm">
                {serverTypeLabel(detected.serverType)}
              </Badge>
              <span className="t-label-12 text-gray-700">
                依据 {detected.source} · {confidence}
              </span>
            </div>
            <p className="t-label-12 mt-1.5 text-gray-800">
              {detected.confidence === "guess"
                ? "未识别到明确特征，暂按这个类型处理；如果有偏差，可以在下面修改。"
                : "已识别服务端类型；读不到版本号时，需要手动确认。"}
            </p>
          </div>
        ) : dir ? (
          <p className="t-label-12 text-gray-700">无法识别服务端类型，暂按 Fabric 处理，导入后可在服务器设置中修改。</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="显示名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="我的服务器" />
          </Field>
          <Field label="Minecraft 版本" hint="无法自动识别时请手动选择，版本不符会导致模组与客户端无法匹配">
            <Picker
              value={mcVersion}
              onValueChange={setMcVersion}
              options={
                versions.length
                  ? versions.map((v) => ({ value: v.id, label: v.id }))
                  : [{ value: mcVersion, label: mcVersion || "读取中…" }]
              }
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="核心类型" hint="识别错了可以手动改">
            <Picker
              value={serverType}
              onValueChange={(v) => setServerType(v as ServerType)}
              options={(["vanilla", "fabric", "forge", "neoforge", "paper", "purpur"] as ServerType[]).map((t) => ({
                value: t,
                label: t === "neoforge" ? "NeoForge（仅导入）" : serverTypeLabel(t),
              }))}
            />
          </Field>
          <Field label="端口">
            <Input value={port} onChange={(e) => setPort(e.target.value)} className="font-mono" />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={probing}>
          取消
        </Button>
        <Button onClick={create} disabled={!dir} loading={probing}>
          <Import className="size-4" />
          导入
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
