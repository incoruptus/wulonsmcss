import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderOpen } from "lucide-react";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Field, Input, Slider } from "@/components/ui/field";
import { useConfig } from "@/stores/config";
import type { Instance } from "@/lib/types";

export function InstanceSettingsDialog({
  open,
  onOpenChange,
  instance,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: Instance;
}) {
  const updateInstance = useConfig((s) => s.updateInstance);
  const [name, setName] = useState(instance.name);
  const [javaPath, setJavaPath] = useState(instance.javaPath);
  const [memoryMin, setMemoryMin] = useState(instance.memoryMin);
  const [memoryMax, setMemoryMax] = useState(instance.memoryMax);
  const [port, setPort] = useState(String(instance.port));
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs);

  useEffect(() => {
    if (!open) return;
    setName(instance.name);
    setJavaPath(instance.javaPath);
    setMemoryMin(instance.memoryMin);
    setMemoryMax(instance.memoryMax);
    setPort(String(instance.port));
    setJvmArgs(instance.jvmArgs);
  }, [open, instance]);

  async function save() {
    await updateInstance(instance.id, {
      name: name.trim() || instance.name,
      javaPath,
      memoryMin,
      memoryMax,
      port: Number(port) || instance.port,
      jvmArgs,
    });
    toast.success("已保存（重启服务器后生效）");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} widthClass="max-w-lg">
      <DialogHeader title="实例设置" desc="改动会在下次启动服务器时生效。" />
      <DialogBody className="space-y-4">
        <Field label="名称">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Java 运行时" hint={javaPath || "未指定"}>
          <div className="flex gap-2">
            <Input value={javaPath} onChange={(e) => setJavaPath(e.target.value)} className="font-mono text-[12px]" />
            <Button
              variant="secondary"
              onClick={async () => {
                const p = await window.mcss.app.pickJava();
                if (p) setJavaPath(p);
              }}
            >
              <FolderOpen className="size-4" />
            </Button>
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`初始内存 ${memoryMin} GB`}>
            <Slider min={1} max={32} step={1} value={[memoryMin]} onValueChange={([v]) => setMemoryMin(Math.min(v, memoryMax))} />
          </Field>
          <Field label={`最大内存 ${memoryMax} GB`}>
            <Slider min={1} max={32} step={1} value={[memoryMax]} onValueChange={([v]) => setMemoryMax(Math.max(v, memoryMin))} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="端口">
            <Input value={port} onChange={(e) => setPort(e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          <Field label="JVM 附加参数" hint="例如 -javaagent:authlib-injector.jar=...">
            <Input value={jvmArgs} onChange={(e) => setJvmArgs(e.target.value)} className="font-mono text-[12px]" />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button onClick={save}>保存</Button>
      </DialogFooter>
    </Dialog>
  );
}
