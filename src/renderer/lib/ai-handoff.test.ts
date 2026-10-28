import { describe, expect, it } from "vitest";
import { buildAiPrompt, redact } from "./ai-handoff";
import type { Instance } from "./types";

const inst: Instance = {
  id: "i1",
  name: "朋友的服",
  dir: "D:\\srv",
  mcVersion: "26.1",
  loader: "fabric",
  loaderVersion: "0.20.1",
  javaPath: "C:\\java\\bin\\java.exe",
  memoryMin: 2,
  memoryMax: 8,
  jvmArgs: "",
  port: 25565,
  createdAt: 0,
  updatedAt: 0,
};

describe("AI 排错交接", () => {
  it("提示词包含实例信息、症状与知识库路径", () => {
    const p = buildAiPrompt({
      instance: inst,
      symptom: { title: "端口被占用", detail: "25565 被别的程序占了" },
      logs: ["[ERROR] FAILED TO BIND TO PORT"],
      docsPath: "D:\\docs\\ai",
    });
    expect(p).toContain("Minecraft 26.1");
    expect(p).toContain("端口被占用");
    expect(p).toContain("FAILED TO BIND TO PORT");
    expect(p).toContain("docs/ai/knowledge.md");
    expect(p).toContain("D:\\docs\\ai");
    expect(p).toContain("不超过 3 个可执行步骤");
  });

  it("令牌会被脱敏", () => {
    const text = redact("Authorization: Bearer abcdef1234567890 and ghp_abcdefghij1234567890");
    expect(text).not.toContain("ghp_abcdefghij");
    expect(text).not.toContain("abcdef1234567890");
    expect(text).toContain("REDACTED");
  });

  it("日志只取最后 80 行", () => {
    const logs = Array.from({ length: 200 }, (_, i) => `line-${i}`);
    const p = buildAiPrompt({ instance: inst, logs });
    expect(p).toContain("line-199");
    expect(p).not.toContain("line-119");
  });
});
