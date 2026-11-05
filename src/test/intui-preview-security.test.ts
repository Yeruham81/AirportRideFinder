// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkPreviewPassword,
  consumePreviewLimit,
  createPreviewSession,
  previewSecretsReady,
  resetPreviewLimitForTests,
  verifyPreviewSession,
} from "@/search/intui-preview-security";

const secrets = {
  accessPassword: "test-only-not-a-real-password-123456789",
  sessionSecret: "test-only-session-secret-not-for-deployment-abcdefghijk",
};
const clock = Date.UTC(2026, 10, 5, 12, 0, 0);

describe("Intui preview server access controls", () => {
  it("refuses missing, short or reused environment secrets", () => {
    expect(previewSecretsReady(secrets)).toBe(true);
    expect(previewSecretsReady({ accessPassword: "short", sessionSecret: secrets.sessionSecret })).toBe(false);
    expect(previewSecretsReady({ accessPassword: secrets.accessPassword, sessionSecret: "short" })).toBe(false);
    expect(previewSecretsReady({ accessPassword: secrets.accessPassword, sessionSecret: secrets.accessPassword })).toBe(false);
    expect(previewSecretsReady({ accessPassword: undefined, sessionSecret: undefined })).toBe(false);
  });

  it("checks the password without exposing it or accepting similar strings", async () => {
    expect(await checkPreviewPassword(secrets.accessPassword, secrets)).toBe(true);
    expect(await checkPreviewPassword(secrets.accessPassword + "x", secrets)).toBe(false);
    expect(await checkPreviewPassword(secrets.accessPassword, { accessPassword: undefined, sessionSecret: secrets.sessionSecret })).toBe(false);
    expect(await checkPreviewPassword("x".repeat(513), secrets)).toBe(false);
  });

  it("uses signed 30-minute sessions with strict expiry and rejects edits", async () => {
    const token = await createPreviewSession(secrets, clock);
    expect(token).toMatch(/^\d{10}\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
    expect(token).not.toContain(secrets.accessPassword);
    expect(token).not.toContain(secrets.sessionSecret);
    expect(await verifyPreviewSession(token!, secrets, clock + 29 * 60 * 1000)).toBe(true);
    expect(await verifyPreviewSession(token!, secrets, clock + 30 * 60 * 1000)).toBe(false);
    expect(await verifyPreviewSession(token!, { ...secrets, sessionSecret: "changed-" + secrets.sessionSecret }, clock)).toBe(false);
    expect(await verifyPreviewSession(token!.replace(/.$/, token!.endsWith("a") ? "b" : "a"), secrets, clock)).toBe(false);
    expect(await verifyPreviewSession(undefined, secrets, clock)).toBe(false);
    expect(await verifyPreviewSession("malformed", secrets, clock)).toBe(false);
    expect(await verifyPreviewSession(token!, secrets, clock - 1000)).toBe(false);
  });

  it("rejects unsigned session guesses and limits brute-force login attempts locally", () => {
    resetPreviewLimitForTests();
    for (let i = 0; i < 5; i++) expect(consumePreviewLimit("login", undefined, clock)).toBe(true);
    expect(consumePreviewLimit("login", undefined, clock)).toBe(false);
    expect(consumePreviewLimit("login", undefined, clock + 5 * 60_000)).toBe(true);
  });

  it("limits authorized quote requests per session and refuses anonymous requests", () => {
    resetPreviewLimitForTests();
    expect(consumePreviewLimit("search", undefined, clock)).toBe(false);
    for (let i = 0; i < 12; i++) expect(consumePreviewLimit("search", "signed-test-session-1", clock)).toBe(true);
    expect(consumePreviewLimit("search", "signed-test-session-1", clock)).toBe(false);
    expect(consumePreviewLimit("search", "signed-test-session-2", clock)).toBe(true);
    expect(consumePreviewLimit("search", "signed-test-session-1", clock + 60 * 60_000)).toBe(true);
    resetPreviewLimitForTests();
  });
});
