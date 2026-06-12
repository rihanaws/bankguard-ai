import { describe, expect, test } from "bun:test";
import { resolveStoragePath } from "@/lib/storage";

describe("resolveStoragePath", () => {
  test("accepts a nested key inside the storage root", () => {
    expect(resolveStoragePath("/tmp/bankguard-storage", "cases/a/letter.pdf")).toBe(
      "/tmp/bankguard-storage/cases/a/letter.pdf",
    );
  });

  test("rejects parent traversal", () => {
    expect(() =>
      resolveStoragePath("/tmp/bankguard-storage", "../outside.pdf"),
    ).toThrow("storageKey escapes storage root");
  });

  test("rejects sibling-prefix escapes", () => {
    expect(() =>
      resolveStoragePath("/tmp/bankguard-storage", "../bankguard-storage2/outside.pdf"),
    ).toThrow("storageKey escapes storage root");
  });

  test("rejects absolute keys", () => {
    expect(() =>
      resolveStoragePath("/tmp/bankguard-storage", "/tmp/outside.pdf"),
    ).toThrow("storageKey must be relative");
  });

  test("rejects Windows-style absolute keys", () => {
    expect(() =>
      resolveStoragePath("/tmp/bankguard-storage", "C:\\outside.pdf"),
    ).toThrow("storageKey must be relative");
  });
});
