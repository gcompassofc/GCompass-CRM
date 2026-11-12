import { describe, expect, it } from "vitest";

import { ehInterno, TAG_INTERNO } from "./interno";

describe("ehInterno", () => {
  it("lead com a etiqueta interno fica fora das contas", () => {
    expect(ehInterno([TAG_INTERNO])).toBe(true);
    expect(ehInterno(["organico", "interno"])).toBe(true);
  });
  it("lead sem a etiqueta conta normalmente", () => {
    expect(ehInterno(["organico", "pago"])).toBe(false);
    expect(ehInterno([])).toBe(false);
    expect(ehInterno(null)).toBe(false);
    expect(ehInterno(undefined)).toBe(false);
  });
});
