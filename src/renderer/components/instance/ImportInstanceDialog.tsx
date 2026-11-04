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
import { pickPath } from "@/lib/path-picker";
import { useI18n } from "@/i18n";

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
  const { t } = useI18n();
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
    const picked = await pickPath({ mode: "dir", title: t("import.pickDirTitle", "选择现有服务器所在的文件夹") });
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
    if (!dir) return toast.error(t("import.noDir", "先选一个服务器目录"));
    if (!mcVersion) return toast.error(t("import.noVersion", "请选择该服务器使用的 Minecraft 版本，无法自动识别时需手动确认"));
    const javas = await window.mcss.app.detectJava().catch(() => []);
    const java = pickJavaFor(javas, javaMajorFor(mcVersion));
    if (!java) return toast.error(t("import.javaMissing", "该服务器需要 Java {major}，可先安装再导入，或先导入后在设置中指定", { major: javaMajorFor(mcVersion) }));
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
    toast.success(t("import.imported", "已导入"), { description: `${inst.name} · ${serverTypeLabel(serverType)} · ${inst.mcVersion}` });
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

  const confidence = detected?.confidence === "high" ? t("import.confidence.high", "确认") : detected?.confidence === "medium" ? t("import.confidence.medium", "较可信") : t("import.confidence.guess", "猜的");

  return (
    <Dialog open={open} onOpenChange={(v) => (probing ? undefined : onOpenChange(v))} widthClass="max-w-xl">
      <DialogHeader
        title={t("import.title", "导入现有服务器")}
        desc={t("import.desc", "已有服务器时，选一下服务器目录就行。程序会根据目录里的文件判断这是哪种服务端，不会改动其中的文件。")}
      />
      <DialogBody className="space-y-4">
        <Field label={t("import.dirLabel", "服务器目录")} hint={dir || t("import.dirHint", "就是包含 server.properties、world、plugins 或 mods 的那个文件夹")}>
          <div className="flex gap-2">
            <Input value={dir} onChange={(e) => setDir(e.target.value)} className="font-mono text-[12px]" placeholder={t("import.dirPlaceholder", "D:\\Servers\\我的服")} />
            <Button variant="secondary" onClick={pick} loading={probing}>
              <FolderSearch className="size-4" />
              {t("import.choose", "选择")}
            </Button>
          </div>
        </Field>

        {detected ? (
          <div className="rounded-lg bg-background-200 p-3">
            <div className="flex items-center gap-2">
              <Badge variant="blue" size="sm">
                {serverTypeLabel(detected.serverType)}
              </Badge>
              <span className="t-label-12 text-gray-700" title={detected.source}>
                {t("import.recognized", "识别结果 · {confidence}", { confidence })}
              </span>
            </div>
            <p className="t-label-12 mt-1.5 text-gray-800">
              {detected.confidence === "guess"
                ? t("import.guessDesc", "未识别到明确特征，暂按这个类型处理；如果有偏差，可以在下面修改。")
                : t("import.detectedDesc", "已识别服务端类型；读不到版本号时，需要手动确认。")}
            </p>
          </div>
        ) : dir ? (
          <p className="t-label-12 text-gray-700">{t("import.unknown", "无法识别服务端类型，暂按 Fabric 处理，导入后可在服务器设置中修改。")}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("import.displayName", "显示名称")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("import.namePlaceholder", "我的服务器")} />
          </Field>
          <Field label={t("import.mcVersion", "Minecraft 版本")} hint={t("import.mcVersionHint", "无法自动识别时请手动选择，版本不符会导致模组与客户端无法匹配")}>
            <Picker
              value={mcVersion}
              onValueChange={setMcVersion}
              options={
                versions.length
                  ? versions.map((v) => ({ value: v.id, label: v.id }))
                  : [{ value: mcVersion, label: mcVersion || t("import.loadingVersion", "读取中…") }]
              }
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("import.serverType", "服务端类型")} hint={t("import.serverTypeHint", "识别错了可以手动改")}>
            <Picker
              value={serverType}
              onValueChange={(v) => setServerType(v as ServerType)}
              options={(["vanilla", "fabric", "forge", "neoforge", "paper", "purpur"] as ServerType[]).map((type) => ({
                value: type,
                label: type === "neoforge" ? t("import.neoforgeOnly", "NeoForge（仅导入）") : serverTypeLabel(type),
              }))}
            />
          </Field>
          <Field label={t("import.port", "端口")}>
            <Input value={port} onChange={(e) => setPort(e.target.value)} className="font-mono" />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={probing}>
          {t("import.cancel", "取消")}
        </Button>
        <Button onClick={create} disabled={!dir} loading={probing}>
          <Import className="size-4" />
          {t("import.import", "导入")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
