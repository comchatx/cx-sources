import { execFile } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { scratch } from "./pi.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PI = join(ROOT, "node_modules", ".bin", "pi");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const BIG = 100_000;

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done)))); });
const listen = async (server: Server): Promise<number> => {
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return (server.address() as AddressInfo).port;
};

/** A source's MCP server on loopback: an answer, a long answer, a picture and a refusal. */
const source = () => listen(createServer(async (request, response) => {
  let text = "";
  for await (const chunk of request) text += String(chunk);
  if (request.method !== "POST" || text === "") { response.writeHead(405).end(); return; }
  const message = JSON.parse(text) as { id?: number; method: string; params?: { name: string; arguments?: Record<string, unknown> } };
  if (message.id === undefined) { response.writeHead(202).end(); return; }
  const args = message.params?.arguments ?? {};
  const answer = (name: string) => name === "echo" ? { content: [{ type: "text", text: `echo:${String(args["text"])}` }], structuredContent: { said: args["text"] } }
    : name === "big" ? { content: [{ type: "text", text: `${"x".repeat(BIG)}END` }] }
    : name === "pic" ? { content: [{ type: "text", text: "a picture" }, { type: "image", data: PNG, mimeType: "image/png" }] }
    : { content: [{ type: "text", text: "the vendor said no" }], isError: true };
  const tool = (name: string) => ({ name, description: name, inputSchema: { type: "object", properties: { text: { type: "string" } } } });
  const result = message.method === "initialize" ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "keepa", version: "0" } }
    : message.method === "tools/list" ? { tools: ["echo", "big", "pic", "fail"].map(tool) }
    : message.method === "tools/call" ? answer(message.params!.name) : {};
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
}));

/** A scripted model: its turns of tool calls in order, then "done". */
const model = (turns: readonly (readonly [string, unknown][])[]) => {
  let n = 0;
  return listen(createServer(async (request, response) => {
    for await (const _ of request) void _;
    const calls = turns[n++];
    const base = { id: "c", object: "chat.completion.chunk", created: 1, model: "m" };
    const chunk = (delta: unknown, finish: string | null) => `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    response.writeHead(200, { "content-type": "text/event-stream" });
    if (calls === undefined) response.write(chunk({ role: "assistant", content: "done" }, null) + chunk({}, "stop"));
    else {
      const tool_calls = calls.map(([name, args], index) => ({ index, id: `call_${String(n)}_${String(index)}`, type: "function", function: { name, arguments: JSON.stringify(args) } }));
      response.write(chunk({ role: "assistant", tool_calls }, null) + chunk({}, "tool_calls"));
    }
    response.end("data: [DONE]\n\n");
  }));
};

type Result = { readonly toolName?: string; readonly content?: readonly { readonly type: string; readonly text?: string }[]; readonly isError?: boolean };

/** The pinned pi with this package installed, a source named `keepa` on its MCP list, run once on `turns`; the tree and what each tool answered. */
async function run(turns: readonly (readonly [string, unknown][])[]) {
  const home = scratch();
  const agent = join(home, "agent");
  const tree = join(realpathSync(home), "tenant");
  for (const directory of [agent, tree]) mkdirSync(directory);
  const [mcp, llm] = [await source(), await model(turns)];
  writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { fx: { baseUrl: `http://127.0.0.1:${String(llm)}/v1`, apiKey: "k", api: "openai-completions",
    models: [{ id: "m", name: "m", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 1024 }] } } }));
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "fx", defaultModel: "m", defaultThinkingLevel: "off", retry: { enabled: false },
    defaultTools: ["+codemode"], defaultProjectTrust: "always", packages: [ROOT] }));
  // The gate adds the seller's credential to what the box sends; the box's own list carries a header of who is asking.
  writeFileSync(join(agent, "mcp.json"), JSON.stringify({ mcpServers: { keepa: { url: `http://127.0.0.1:${String(mcp)}/mcp`, exposure: "direct", headers: { "x-person": "secret-person-header" } } } }));
  const env = { ...process.env, PI_CODING_AGENT_DIR: agent, HOME: agent, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" };
  const child = promisify(execFile)(PI, ["--mode", "json", "-p", "go", "--session-dir", join(home, "sessions")], { cwd: tree, env, maxBuffer: 64 * 1024 * 1024 });
  child.child.stdin?.end();
  const { stdout } = await child;
  const results = stdout.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as { type: string; message?: Result & { role?: string } })
    .filter((event) => event.type === "message_end" && event.message?.role === "toolResult").map((event) => event.message!);
  return { tree, results };
}

const files = (directory: string): string[] => readdirSync(directory).sort();
const day = () => new Date().toISOString().slice(0, 10);
const told = (result: Result | undefined) => result?.content?.at(-1)?.text ?? "";

it("each answer a source's tool gives is kept under raw/<source>/<date>/ with its ask, a long one whole, a picture as its own file, a refusal not at all", async () => {
  const { tree, results } = await run([[["mcp__keepa__echo", { text: "B0CHX1W1XY" }], ["mcp__keepa__big", { text: "long" }], ["mcp__keepa__pic", {}], ["mcp__keepa__fail", {}]]]);
  const place = join(tree, "raw", "keepa", day());
  const kept = files(place);
  const named = (ask: string) => kept.find((file) => new RegExp(`^\\d{6}Z-${ask}-[0-9a-f]{8}$`).test(file));
  const [echo, big, pic] = [named("mcp-echo-b0chx1w1xy"), named("mcp-big-long"), named("mcp-pic")];
  expect([echo, big, pic].every((file) => file !== undefined)).toBe(true);
  expect(kept).toEqual([echo, `${echo}.ask.json`, big, `${big}.ask.json`, pic, `${pic}-1.png`, `${pic}.ask.json`].sort());
  // The whole answer, where pi cut what the model reads.
  expect(JSON.parse(readFileSync(join(place, big!), "utf8")).content[0].text).toHaveLength(BIG + 3);
  expect(results.find((result) => result.toolName === "mcp__keepa__big")?.content?.[0]?.text?.length).toBeLessThan(BIG);
  expect(readFileSync(join(place, `${pic!}-1.png`)).equals(Buffer.from(PNG, "base64"))).toBe(true);
  expect(JSON.parse(readFileSync(join(place, pic!), "utf8")).content[1]).toEqual({ type: "image", mimeType: "image/png", file: `${pic!}-1.png` });
  expect(JSON.parse(readFileSync(join(place, echo!), "utf8"))).toEqual({ content: [{ type: "text", text: "echo:B0CHX1W1XY" }], structuredContent: { said: "B0CHX1W1XY" } });
  const ask = JSON.parse(readFileSync(join(place, `${echo!}.ask.json`), "utf8")) as Record<string, unknown>;
  expect(ask).toEqual({ source: "keepa", origin: null, tool: "echo", arguments: { text: "B0CHX1W1XY" }, header_names: null, body: null, fetched_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    request_id: null, raw_record_id: null, http_status: null, channel: null, cost: null, bytes: readFileSync(join(place, echo!)).length, file: echo });
  // What the box's MCP list holds is never written.
  for (const file of kept) expect(readFileSync(join(place, file)).includes("secret-person-header"), file).toBe(false);
  expect(told(results.find((result) => result.toolName === "mcp__keepa__echo"))).toBe(`Kept as ${join(place, echo!)}, its ask beside it in ${echo!}.ask.json.`);
  expect(results.find((result) => result.toolName === "mcp__keepa__fail")).toMatchObject({ isError: true });
  expect(told(results.find((result) => result.toolName === "mcp__keepa__fail"))).toBe("the vendor said no");
}, 60_000);

it("a call a codemode script makes is kept as a direct one is, and the script is told the file", async () => {
  const code = `const a = await tools.mcp__keepa__echo({ text: "nested" });
const b = await tools.mcp__keepa__big({ text: "nested" });
const f = await tools.mcp__keepa__fail({});
return { told: a.content.at(-1).text, length: b.content[0].text.length, failed: f.isError };`;
  const { tree, results } = await run([[["codemode", { code }]]]);
  const place = join(tree, "raw", "keepa", day());
  const kept = files(place);
  expect(kept.map((file) => file.replace(/^\d{6}Z-/, "").replace(/-[0-9a-f]{8}/, "")).sort()).toEqual(["mcp-big-nested", "mcp-big-nested.ask.json", "mcp-echo-nested", "mcp-echo-nested.ask.json"]);
  const echo = kept.find((file) => file.includes("echo") && !file.endsWith(".ask.json"))!;
  const answer = results.find((result) => result.toolName === "codemode")?.content?.map((part) => part.text ?? "").join("") ?? "";
  expect(answer).toContain(`Kept as ${join(place, echo)}`);
  expect(answer).toContain(String(BIG + 3));
}, 60_000);

it("the same ask twice in one second takes the next name, and nothing is replaced", async () => {
  const { tree } = await run([[["mcp__keepa__echo", { text: "twice" }], ["mcp__keepa__echo", { text: "twice" }]]]);
  const kept = files(join(tree, "raw", "keepa", day())).filter((file) => !file.endsWith(".ask.json"));
  expect(kept).toHaveLength(2);
  const [first, second] = kept as [string, string];
  // Two calls may fall either side of a second; within one, the second is `<name>-2`.
  if (first.slice(0, 6) === second.slice(0, 6)) expect(second).toBe(`${first}-2`);
}, 60_000);
