import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE, PALETTES, isPaletteId, paletteOf } from "./themes";

describe("茶色主题清单", () => {
  it("五种茶都在，id 不重复", () => {
    expect(PALETTES).toHaveLength(5);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(5);
    expect(PALETTES.map((p) => p.name)).toEqual(["西湖龙井", "白毫银针", "祁门工夫", "君山银针", "云南普洱"]);
  });

  it("每套茶都有浅色/深色各三格色卡，且都是合法 hex", () => {
    for (const palette of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        expect(palette.swatch[mode]).toHaveLength(3);
        for (const color of palette.swatch[mode]) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("未知值回退到默认绿茶，不抛错", () => {
    expect(isPaletteId("green")).toBe(true);
    expect(isPaletteId("oolong")).toBe(false);
    expect(paletteOf("oolong").id).toBe(DEFAULT_PALETTE);
    expect(paletteOf(undefined).id).toBe("green");
  });
});
