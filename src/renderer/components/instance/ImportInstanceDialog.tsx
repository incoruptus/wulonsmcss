import { useState } from "react";
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
import type { ServerType } from "@/lib/types";

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
  const [mcVersion, setMcVersion] = useState("26.1");
  const [port, setPort] = useState("25565");
  const [serverType, setServerType] = useState<ServerType>("fabric");

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
    const inst = makeInstance({
      name: name.trim() || leafOf(dir),
      dir,
      mcVersion,
      serverType,
      loaderVersion: detected?.loaderVersion,
      javaPath: "",
      port: Number(port) || 25565,
      importedFrom: dir,
    });
    await addInstance(inst);
    toast.success("已导入", { description: `${inst.name} · ${serverTypeLabel(serverType)} · ${inst.mcVersion}` });
    onOpenChange(false);
    reset();
    navigate(`/instances/${inst.id}`);
  }

  function reset() {
    setDir("");
    setDetected(null);
    setName("");
    setPort("25565");
  }

  const confidence = detected?.confidence === "high" ? "确认" : detected?.confidence === "medium" ? "较可信" : "猜的";

  return (
    <Dialog open={open} onOpenChange={(v) => (probing ? undefined : onOpenChange(v))} widthClass="max-w-xl">
      <DialogHeader
        title="导入现有服务器"
        desc="已经有服了？指一下目录就行。我会读目录特征判断核心类型，不会动你的文件。"
      />
      <DialogBody className="space-y-4">
        <Field label="服务器目录" hint={dir || "包含 server.properties / world / plugins 或 mods 的那个目录"}>
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
                ? "没找到明确特征，先按这个猜的——不对的话在下面的核心类型里改一下就行。"
                : "识别到核心类型。版本号读不到时需要你确认一下。"}
            </p>
          </div>
        ) : dir ? (
          <p className="t-label-12 text-gray-700">没认出来这是什么服务端，先按 Fabric 处理；导入后可以在实例设置里改。</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="显示名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="我的服务器" />
          </Field>
          <Field label="Minecraft 版本">
            <Input value={mcVersion} onChange={(e) => setMcVersion(e.target.value)} placeholder="26.1" className="font-mono" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="核心类型" hint="识别错了可以手动改">
            <Picker
              value={serverType}
              onValueChange={(v) => setServerType(v as ServerType)}
              options={(["vanilla", "fabric", "forge", "neoforge", "paper", "purpur"] as ServerType[]).map((t) => ({
                value: t,
                label: serverTypeLabel(t),
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
