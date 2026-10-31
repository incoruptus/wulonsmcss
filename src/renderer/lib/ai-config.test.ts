import { describe, expect, it } from "vitest";
import { applyChanges, buildConfigPrompt, extractJson, parseConfigReply } from "./ai-config";

const props: Record<string, string> = {
  motd: "A Minecraft Server",
  difficulty: "easy",
  "max-players": "20",
  pvp: "true",
  "view-distance": "10",
  "server-port": "25565",
  "online-mode": "true",
};

describe("配置提示词", () => {
  it("把当前配置、允许的键和输出格式都写进去", () => {
    const prompt = buildConfigPrompt({ mc: "26.1", loader: "fabric", players: 4 }, props, "周末生存，别太肝");
    expect(prompt).toContain("周末生存，别太肝");
    expect(prompt).toContain('"difficulty": "easy"');
    expect(prompt).toContain("max-players");
    expect(prompt).toContain('{ "changes": { "配置项键名": "修改后的值" }');
  });
});

describe("从回复里取 JSON", () => {
  it("支持 ```json 包裹", () => {
    const data = extractJson('好的：\n```json\n{"changes":{"pvp":"false"}}\n```\n完成');
    expect(data).toEqual({ changes: { pvp: "false" } });
  });

  it("支持前后有废话的裸 JSON", () => {
    expect(extractJson('我认为这样：{"changes":{"motd":"x"}} 就这样')).toEqual({ changes: { motd: "x" } });
  });

  it("没有 JSON 时给明确错误", () => {
    expect(() => extractJson("我觉得挺好的")).toThrow(/识别到 JSON|JSON 数据/);
  });
});

describe("校验 AI 改动", () => {
  it("正常改动被接受，并算出 from/to", () => {
    const res = parseConfigReply('{"changes":{"difficulty":"hard","pvp":"false"},"notes":"调难一点"}', props);
    expect(res.changes).toEqual([
      { key: "difficulty", from: "easy", to: "hard", level: "ok", note: undefined },
      { key: "pvp", from: "true", to: "false", level: "ok", note: undefined },
    ]);
    expect(res.notes).toBe("调难一点");
  });

  it("未知键被拒绝", () => {
    const res = parseConfigReply('{"changes":{"enable-rcon":"true","motd":"hi"}}', props);
    expect(res.rejected[0].key).toBe("enable-rcon");
    expect(res.changes.map((c) => c.key)).toEqual(["motd"]);
  });

  it("数字键给了非数字会被拒", () => {
    const res = parseConfigReply('{"changes":{"max-players":"很多"}}', props);
    expect(res.rejected[0].reason).toMatch(/数字/);
    expect(res.changes).toHaveLength(0);
  });

  it("枚举键只接受固定取值", () => {
    const res = parseConfigReply('{"changes":{"difficulty":"nightmare"}}', props);
    expect(res.rejected[0].reason).toMatch(/peaceful/);
  });

  it("敏感键标成 warn", () => {
    const res = parseConfigReply('{"changes":{"server-port":"25566"}}', props);
    expect(res.changes[0].level).toBe("warn");
  });

  it("值没变的不算改动", () => {
    const res = parseConfigReply('{"changes":{"difficulty":"easy"}}', props);
    expect(res.changes).toHaveLength(0);
  });

  it("缺少 changes 字段时报错而不是崩", () => {
    const res = parseConfigReply('{"notes":"我什么都没改"}', props);
    expect(res.error).toMatch(/changes/);
  });

  it("应用改动不改原对象", () => {
    const next = applyChanges(props, [{ key: "motd", from: "a", to: "b", level: "ok" }]);
    expect(next.motd).toBe("b");
    expect(props.motd).toBe("A Minecraft Server");
  });
});
