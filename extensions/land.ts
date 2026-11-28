import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import type { JsonValue } from "@earendil-works/pi-ai";

type Block = { readonly type: string; readonly text?: string; readonly data?: string; readonly mimeType?: string };

/** An `<ask>` as the raw door cuts one: lower case, every run outside [a-z0-9] one "-", at most 80 characters, "ask" when nothing is left. */
const cut = (words: string): string => words.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "") || "ask";

const values = (value: unknown): string[] =>
  value === null || value === undefined ? [] : Array.isArray(value) ? value.flatMap(values)
    : typeof value === "object" ? Object.values(value).flatMap(values) : [String(value)];

const opened = (path: string) => open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);

/** A file this extension makes and no one else has: never through a link, never over another. */
const create = async (path: string, bytes: string | Buffer): Promise<void> => {
  const handle = await opened(path);
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
};

/** The name, or, when the same ask in the same second has it, the next of `<name>-2` to `<name>-9`, as the raw door names a reply. */
const claim = async (place: string, name: string) => {
  for (let n = 1; ; n += 1) {
    const taken = n === 1 ? name : `${name}-${String(n)}`;
    try { return { name: taken, handle: await opened(join(place, taken)) }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || n === 9) throw error; }
  }
};

/** Each directory made one level at a time, and a plain directory, not a link to one. */
const directory = async (root: string, names: readonly string[]): Promise<string> => {
  let path = root;
  for (const name of names) {
    path = join(path, name);
    await mkdir(path, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    if (!(await lstat(path)).isDirectory()) throw new Error(`${path} is not a plain directory`);
  }
  return path;
};

/**
 * What a source's MCP tool answers is kept in the seller's tree as the raw door keeps a reply: under `raw/<source>/<date>/`, named by the
 * time, the ask and its hash, with `<name>.ask.json` beside it, and an image block as a file of its own. The source is the server's name,
 * which is the source's. A result the tool marked an error lands nothing. The model is told the file's path in one more text block.
 */
export default function (pi: ExtensionAPI): void {
  pi.on("tool_result", async (event, ctx): Promise<ToolResultEventResult | undefined> => {
    const named = /^mcp__(.+?)__(.+)$/.exec(event.toolName);
    if (named === null || event.isError) return undefined;
    const [, source, tool] = named as unknown as [string, string, string];
    const at = new Date();
    const stamp = at.toISOString();
    const args = (event.input ?? {}) as Record<string, unknown>;
    const hash = createHash("sha256").update(JSON.stringify({ source, tool, arguments: args })).digest("hex").slice(0, 8);
    const name = `${stamp.slice(11, 19).replaceAll(":", "")}Z-${cut(["mcp", tool, ...values(args)].join("-"))}-${hash}`;
    // pi cuts a long text for the model; its structured content is the server's whole answer.
    const whole = (event.structuredContent ?? { content: event.content }) as { readonly content?: readonly Block[] };
    // The line goes to the model and, in the structured answer, to a codemode script that made the call.
    const told = (text: string): ToolResultEventResult => {
      const line = { type: "text" as const, text };
      const structured = event.structuredContent;
      const answer = structured !== null && typeof structured === "object" && !Array.isArray(structured) ? structured as { readonly [key: string]: JsonValue } : undefined;
      const said = answer !== undefined && Array.isArray(answer["content"])
        ? { structuredContent: { ...answer, content: [...(answer["content"] as JsonValue[]), line] } } : structured === undefined ? {} : { structuredContent: structured };
      return { content: [...event.content, line], ...said };
    };
    try {
      const place = await directory(ctx.cwd, ["raw", source, stamp.slice(0, 10)]);
      const { name: file, handle } = await claim(place, name);
      let bytes: string;
      try {
        const kept = await Promise.all((whole.content ?? []).map(async (block, n) => {
          if (block.type !== "image" || block.data === undefined) return block;
          const image = `${file}-${String(n)}.${cut(block.mimeType?.split("/")[1] ?? "bin")}`;
          await create(join(place, image), Buffer.from(block.data, "base64"));
          return { type: "image", mimeType: block.mimeType, file: image };
        }));
        bytes = `${JSON.stringify({ ...whole, content: kept }, null, 2)}\n`;
        await handle.writeFile(bytes);
      } finally { await handle.close(); }
      await create(join(place, `${file}.ask.json`), `${JSON.stringify({
        source, origin: null, tool, arguments: args, header_names: null, body: null, fetched_at: stamp, request_id: null, raw_record_id: null,
        http_status: null, channel: null, cost: null, bytes: Buffer.byteLength(bytes), file,
      }, null, 2)}\n`);
      return told(`Kept as ${join(place, file)}, its ask beside it in ${file}.ask.json.`);
    } catch (error) {
      return told(`Not kept as a file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
