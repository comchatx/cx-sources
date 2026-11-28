import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ToolResultEventResult } from "@earendil-works/pi-coding-agent";

type Block = { readonly type: string; readonly text?: string; readonly data?: string; readonly mimeType?: string };

/** An `<ask>` word as the raw door cuts one: lower case, every run outside [a-z0-9] one "-", at most 80 characters, "ask" when nothing is left. */
const cut = (words: string): string => words.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "") || "ask";

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
 * Whether `server` is a source the box registered: the steward writes pi's agent-level `mcp.json` whole, one server per source, keyed by the
 * source's name and served at `<route>/mcp/<source>`. Any other server — the seller's own, or a project's — is not a source.
 */
const registered = async (agentDir: string, server: string): Promise<boolean> => {
  const listed = await readFile(join(agentDir, "mcp.json"), "utf8").then((text) => JSON.parse(text) as { mcpServers?: Record<string, { url?: unknown }> }, () => undefined);
  const url = listed?.mcpServers !== undefined && Object.hasOwn(listed.mcpServers, server) ? listed.mcpServers[server]?.url : undefined;
  if (typeof url !== "string") return false;
  try { return new URL(url).pathname === `/mcp/${server}`; } catch { return false; }
};

export type Landing = { readonly now?: () => Date; readonly agentDir?: () => string };

/**
 * What a source's MCP tool answers is kept in the seller's tree as the raw door keeps a reply: under `raw/<source>/<date>/`, named by the
 * time, the tool and a hash of the ask, an image block as a file of its own, and last `<name>.ask.json` with the tool and the arguments as
 * typed; the record's presence is what "kept" means. The source and the tool are the registration's own names, from pi's result details.
 * A result marked an error, or from a server that is no source, lands nothing. A direct call's model-facing content gets one line naming
 * the file; a codemode script's answer is the server's, untouched.
 */
export const land = ({ now = () => new Date(), agentDir = getAgentDir }: Landing = {}) => (pi: ExtensionAPI): void => {
  pi.on("tool_result", async (event, ctx): Promise<ToolResultEventResult | undefined> => {
    if (event.isError || !event.toolName.startsWith("mcp__")) return undefined;
    const { server: source, tool } = (event.details ?? {}) as { server?: unknown; tool?: unknown };
    if (typeof source !== "string" || typeof tool !== "string" || !(await registered(agentDir(), source))) return undefined;
    const told = (text: string) => (event.parentToolCallId === undefined ? { content: [...event.content, { type: "text" as const, text }] } : undefined);
    const stamp = now().toISOString();
    const args = event.input;
    const hash = createHash("sha256").update(JSON.stringify({ source, tool, arguments: args })).digest("hex").slice(0, 8);
    // pi cuts a long text for the model; its structured content is the server's whole answer.
    const whole = (event.structuredContent ?? { content: event.content }) as { readonly content?: readonly Block[] };
    const made: string[] = [];
    try {
      const place = await directory(ctx.cwd, ["raw", source, stamp.slice(0, 10)]);
      const { name: file, handle } = await claim(place, `${stamp.slice(11, 19).replaceAll(":", "")}Z-mcp-${cut(tool)}-${hash}`);
      made.push(join(place, file));
      let bytes: string;
      try {
        const kept = await Promise.all((whole.content ?? []).map(async (block, n) => {
          if (block.type !== "image" || block.data === undefined) return block;
          const image = `${file}-${String(n)}.${cut(block.mimeType?.split("/")[1] ?? "bin")}`;
          await create(join(place, image), Buffer.from(block.data, "base64"));
          made.push(join(place, image));
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
      const why = error instanceof Error ? error.message : String(error);
      return told(made.length === 0 ? `Not kept: ${why}` : `Not kept, with no record: ${made.join(", ")} (${why})`);
    }
  });
};

export default land();
