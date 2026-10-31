import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, RefreshCw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { Card, EmptyState, SegmentedControl } from "@/components/ui/misc";
import { Callout } from "@/components/ui/callout";
import type { Instance } from "@/lib/types";
import { AiConfigDialog } from "@/components/instance/AiConfigDialog";

import { BOOL_META, BOOL_ORDER, SELECT_META, TEXT_META } from "@/lib/server-properties";

type Props = Record<string, string>;

const BOOL_KEYS = BOOL_ORDER;
const TEXT_FIELDS = Object.entries(TEXT_META).map(([key, meta]) => ({ key, ...meta }));

export function ConfigTab({ instance }: { instance: Instance }) {
  const path = `${instance.dir}\\server.properties`;
  const [props, setProps] = useState<Props | null>(null);
  const [draft, setDraft] = useState<Props>({});
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    try {
      const exists = await window.mcss.fs.exists(path);
      if (!exists) {
        setError("尚未生成 server.properties，启动一次服务器后会自动创建。");
        return;
      }
      const data = await window.mcss.props.read(path);
      setProps(data);
      setDraft(data);
      setRaw(
        Object.entries(data)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n"),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.dir]);

  const dirty = useMemo(() => {
    if (!props) return false;
    return Object.keys({ ...props, ...draft }).some((k) => props[k] !== draft[k]);
  }, [props, draft]);

  async function save() {
    setSaving(true);
    try {
      if (mode === "raw") {
        const parsed: Props = {};
        for (const line of raw.split(/\r?\n/)) {
          const t = line.trim();
          if (!t || t.startsWith("#")) continue;
          const i = t.indexOf("=");
          if (i === -1) continue;
          parsed[t.slice(0, i).trim()] = t.slice(i + 1).trim();
        }
        await window.mcss.props.write(path, { ...props, ...parsed });
      } else {
        await window.mcss.props.write(path, { ...props, ...draft });
      }
      toast.success("已保存，重启服务器后生效");
      await load();
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={<AlertCircle className="size-5" />}
          title="读不到配置"
          desc={error}
          action={
            <Button variant="secondary" onClick={load}>
              <RefreshCw className="size-4" />
              重试
            </Button>
          }
        />
      </Card>
    );
  }

  if (!props) return <div className="t-label-13 text-gray-700">加载中…</div>;

  return (
    <div className="space-y-4">
      <Callout tone="info" title="这里改的是服务器规则">
        难度、人数、正版验证、死亡掉落等都在这里。不知道怎么选就保持默认；保存后重启服务器才会生效。
      </Callout>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SegmentedControl
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "form", label: "表单" },
              { value: "raw", label: "原始文件（高级）" },
            ]}
          />
          {dirty ? <span className="t-label-12 text-amber-900">● 未保存</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAiOpen(true)}>
            <Sparkles className="size-3.5" />
            AI 助手
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (dirty && !window.confirm("存在未保存的修改，确定放弃并重新载入？")) return;
              void load();
            }}
          >
            <RefreshCw className="size-3.5" />
            重新载入
          </Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!dirty && mode === "form"}>
            <Save className="size-3.5" />
            保存
          </Button>
        </div>
      </div>

      {mode === "raw" ? (
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
          className="h-[52vh] w-full resize-none rounded-xl bg-background-100 p-3 font-mono text-[12.5px] leading-5 text-gray-1000 shadow-geist-border focus-visible:outline-none scroll-thin"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h3 className="t-h-14 text-gray-1000">基础</h3>
            {TEXT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <Input
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              </Field>
            ))}
          </Card>

          <div className="space-y-4">
            <Card className="space-y-3">
              <h3 className="t-h-14 text-gray-1000">玩法</h3>
              {Object.entries(SELECT_META).map(([key, meta]) => (
                <Field key={key} label={meta.label} hint={meta.hint}>
                  <Picker
                    value={draft[key] ?? meta.options[0].value}
                    onValueChange={(v) => setDraft({ ...draft, [key]: v })}
                    options={meta.options}
                  />
                </Field>
              ))}
              <Field label="强制游戏模式">
                <Switch
                  checked={draft["force-gamemode"] === "true"}
                  onCheckedChange={(v) => setDraft({ ...draft, "force-gamemode": String(v) })}
                />
              </Field>
            </Card>

            <Card>
              <h3 className="t-h-14 mb-2 text-gray-1000">开关</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {BOOL_KEYS.map((key) => (
                  <label key={key} className="flex items-start justify-between gap-3 rounded-md px-1 py-1">
                    <span className="min-w-0">
                      <span className="t-label-13 block text-gray-900">{BOOL_META[key]?.label ?? key}</span>
                      {BOOL_META[key]?.hint ? (
                        <span className="t-label-12 mt-0.5 block leading-4 text-gray-700">{BOOL_META[key].hint}</span>
                      ) : null}
                    </span>
                    <Switch
                      checked={draft[key] === "true"}
                      onCheckedChange={(v) => {
                        if (key === "online-mode" && !v) {
                          if (!window.confirm("关闭后任何客户端均可进入，玩家名称可能被冒用，确认关闭？")) return;
                        }
                        if (key === "hardcore" && v) {
                          if (!window.confirm("极限模式下死亡后无法复活，且难以恢复，确认开启？")) return;
                        }
                        setDraft({ ...draft, [key]: String(v) });
                      }}
                    />
                  </label>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      <AiConfigDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        instance={instance}
        props={props}
        onApply={(next) => {
          setDraft(next);
          if (mode === "raw") setRaw(Object.entries(next).map(([k, v]) => `${k}=${v}`).join("\n"));
        }}
      />
    </div>
  );
}
