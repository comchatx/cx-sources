import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { land } from "../extensions/land.js";
import { scratch } from "./pi.js";

const AT = new Date("2026-11-28T06:30:05.000Z");
type Handler = (event: unknown, ctx: { cwd: string }) => Promise<{ content?: { type: string; text?: string }[] } | undefined>;

/** The handler as pi would hold it, on a clock that stands still, with the steward's MCP list naming the source `keepa`. */
function handler() {
  const home = scratch();
  const agent = join(home, "agent");
  const tree = join(home, "tenant");
  for (const directory of [agent, tree]) mkdirSync(directory);
  writeFileSync(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { keepa: { url: "http://127.0.0.1:1/mcp/keepa" } } }));
  let on: Handler | undefined;
  land({ now: () => AT, agentDir: () => agent })({ on: (_: string, handle: Handler) => { on = handle; } } as unknown as ExtensionAPI);
  const call = (input: Record<string, unknown> = { asin: "B0CHX1W1XY" }) => on!({
    type: "tool_result", toolName: "mcp__keepa__product", toolCallId: "c", input, details: { server: "keepa", tool: "product" },
    content: [{ type: "text", text: "{}" }], structuredContent: { content: [{ type: "text", text: "{}" }] }, isError: false,
  }, { cwd: tree });
  return { call, place: join(tree, "raw", "keepa", "2026-11-28") };
}

it("the same ask in the same second takes <name>-2 up to <name>-9, and past -9 nothing is kept and nothing is replaced", async () => {
  const { call, place } = handler();
  for (let n = 0; n < 9; n += 1) await call();
  const answers = readdirSync(place).filter((file) => !file.endsWith(".ask.json")).sort();
  const first = answers[0]!;
  expect(first).toMatch(/^063005Z-mcp-product-[0-9a-f]{8}$/);
  expect(answers).toEqual([first, ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${first}-${String(n)}`)].sort());
  expect(readdirSync(place).filter((file) => file.endsWith(".ask.json"))).toHaveLength(9);
  const tenth = await call();
  expect(tenth?.content?.at(-1)?.text).toMatch(/^Not kept: EEXIST/);
  expect(readdirSync(place)).toHaveLength(18);
});

it("an answer whose record cannot be written is named as standing without one, and its record's place is left as it was", async () => {
  const { call, place } = handler();
  await call();
  const first = readdirSync(place).find((file) => !file.endsWith(".ask.json"))!;
  // The record the next answer would take is already someone else's.
  writeFileSync(join(place, `${first}-2.ask.json`), "theirs");
  const told = (await call())?.content?.at(-1)?.text;
  expect(told).toMatch(new RegExp(`^Not kept, with no record: ${join(place, `${first}-2`).replaceAll("/", "\\/")} \\(EEXIST`));
  expect(readdirSync(place).sort()).toEqual([first, `${first}-2`, `${first}-2.ask.json`, `${first}.ask.json`].sort());
});
