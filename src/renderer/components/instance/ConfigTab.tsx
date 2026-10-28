import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Card, EmptyState, SegmentedControl } from "@/components/ui/misc";
import type { Instance } from "@/lib/types";

type Props = Record<string, string>;

const BOOL_KEYS = [
  "pvp",
  "online-mode",
  "allow-flight",
  "white-list",
  "enforce-whitelist",
  "enable-command-block",
  "hardcore",
  "allow-nether",
  "spawn-animals",
  "spawn-monsters",
  "spawn-npcs",
  "force-gamemode",
] as const;

const SELECTS: Record<string, string[]> = {
  difficulty: ["peaceful", "easy", "normal", "hard"],
  gamemode: ["survival", "creative", "adventure", "spectator"],
  leveltype: ["minecraft:normal", "minecraft:flat", "minecraft:large_biomes", "minecraft:amplified"],
};

const TEXT_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "motd", label: "服务器标语（MOTD）", hint: "支持 § 颜色代码" },
  { key: "max-players", label: "最大玩家数" },
  { key: "server-port", label: "端口" },
  { key: "view-distance", label: "视距（区块）" },
  { key: "simulation-distance", label: "模拟距离（区块）" },
  { key: "spawn-protection", label: "出生点保护半径" },
  { key: "level-seed", label: "世界种子" },
];

export function ConfigTab({ instance }: { instance: Instance }) {
  const path = `${instance.dir}\\server.properties`;
  const [props, setProps] = useState<Props | null>(null);
  const [draft, setDraft] = useState<Props>({});
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(null);
    try {
      const exists = await window.mcss.fs.exists(path);
      if (!exists) {
        setError("还没有 server.properties —— 启动一次服务器就会自动生成。");
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
      <div className="flex items-center justify-between">
        <SegmentedControl
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "form", label: "表单" },
            { value: "raw", label: "源码" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
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
              {Object.keys(SELECTS).map((key) => (
                <Field key={key} label={key}>
                  <Select
                    value={draft[key] ?? SELECTS[key][0]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    options={SELECTS[key].map((v) => ({ value: v, label: v }))}
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
                  <label key={key} className="flex items-center justify-between gap-2">
                    <span className="t-label-13 text-gray-900">{key}</span>
                    <Switch
                      checked={draft[key] === "true"}
                      onCheckedChange={(v) => setDraft({ ...draft, [key]: String(v) })}
                    />
                  </label>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
