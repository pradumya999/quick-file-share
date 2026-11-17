import { describe, expect, it } from "vitest";

import { checkFiles, generateTransferCode, isValidTransferCode, MAX_FILE_BYTES } from "@/lib/transfer-rules";

describe("transfer rules", () => {
  it("accepts only six-digit transfer codes", () => {
    expect(isValidTransferCode("123456")).toBe(true);
    expect(isValidTransferCode("12345")).toBe(false);
    expect(isValidTransferCode("12a456")).toBe(false);
  });

  it("generates six-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(isValidTransferCode(generateTransferCode())).toBe(true);
    expect(generateTransferCode(() => 0.999)).toBe("999999");
  });

  it("rejects files over 50 MB", () => {
    expect(checkFiles([{ name: "big.zip", size: MAX_FILE_BYTES + 1 }])).not.toBeNull();
    expect(checkFiles([{ name: "ok.zip", size: MAX_FILE_BYTES }])).toBeNull();
  });

  it("allows at most 20 files per transfer", () => {
    const files = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `f${i}`, size: 1 }));
    expect(checkFiles(files(20))).toBeNull();
    expect(checkFiles(files(21))).not.toBeNull();
    expect(checkFiles([])).not.toBeNull();
  });
});
