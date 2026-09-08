import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getCodexInstructions } from "../lib/prompts/codex.js";

vi.mock("node:fs", () => ({
	existsSync: vi.fn(), mkdirSync: vi.fn(),
	readFileSync: vi.fn(), writeFileSync: vi.fn(),
}));

const cache = join(homedir(), ".opencode", "cache");
const prompt = join(cache, "gpt-6-astra-instructions.md");
const meta = join(cache, "gpt-6-astra-instructions-meta.json");
const tag = "rust-v0.153.4";
const url = `https://raw.githubusercontent.com/openai/codex/${tag}/codex-rs/models-manager/models.json`;
const messages = { instructions_template: "Official Astra text\n", instructions_variables: null };
const catalog = { models: [null, { slug: "gpt-5.1" }, { slug: "gpt-6-astra", model_messages: messages }] };
let files: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	files = new Map();
	vi.mocked(existsSync).mockImplementation((path) => files.has(String(path)));
	vi.mocked(readFileSync).mockImplementation((path) => files.get(String(path)) ?? (String(path).endsWith("gpt-6-astra-instructions.md") ? "Bundled Astra" : "Wrong legacy fallback"));
	vi.mocked(writeFileSync).mockImplementation((path, data) => { files.set(String(path), String(data)); });
	fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ tag_name: tag }));
	vi.stubGlobal("fetch", fetchMock);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Astra prompt retrieval", () => {
	it("extracts only Astra instructions and caches them separately from GPT-5.1", async () => {
		files.set(join(cache, "gpt-5.1-instructions.md"), "Old GPT-5.1");
		files.set(join(cache, "gpt-5.1-instructions-meta.json"), JSON.stringify({ lastChecked: Date.now() }));
		fetchMock.mockResolvedValueOnce(Response.json(catalog, { headers: { etag: '"astra"' } }));
		expect(await getCodexInstructions("gpt-6-astra")).toBe(messages.instructions_template);
		expect(fetchMock).toHaveBeenLastCalledWith(url, { headers: {} });
		expect(files.get(prompt)).toBe(messages.instructions_template);
		expect(JSON.parse(files.get(meta)!)).toMatchObject({ tag, etag: '"astra"', url });
		expect(files.get(join(cache, "gpt-5.1-instructions.md"))).toBe("Old GPT-5.1");
		fetchMock.mockClear();
		expect(await getCodexInstructions("gpt-6-astra")).toBe(messages.instructions_template);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([tag, "older-release"])("revalidates stale cache with release %s", async (cachedTag) => {
		files.set(prompt, "Cached Astra");
		files.set(meta, JSON.stringify({ tag: cachedTag, etag: '"astra"', lastChecked: 1 }));
		fetchMock.mockResolvedValueOnce(cachedTag === tag ? new Response(null, { status: 304 }) : Response.json(catalog));
		expect(await getCodexInstructions("gpt-6-astra")).toBe(cachedTag === tag ? "Cached Astra" : messages.instructions_template);
		expect(fetchMock).toHaveBeenLastCalledWith(url, { headers: cachedTag === tag ? { "If-None-Match": '"astra"' } : {} });
	});

	it("refreshes the cache TTL after a successful 304", async () => {
		const now = 2_000_000;
		vi.spyOn(Date, "now").mockReturnValue(now);
		files.set(prompt, "Cached Astra");
		files.set(meta, JSON.stringify({ tag, etag: '"astra"', lastChecked: 1, url }));
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
		expect(await getCodexInstructions("gpt-6-astra")).toBe("Cached Astra");
		fetchMock.mockClear();
		expect(await getCodexInstructions("gpt-6-astra")).toBe("Cached Astra");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(JSON.parse(files.get(meta)!)).toEqual({ tag, etag: '"astra"', lastChecked: now, url });
	});

	it("omits the conditional ETag when the cached body is missing", async () => {
		files.set(meta, JSON.stringify({ tag, etag: '"astra"', lastChecked: Date.now(), url }));
		fetchMock.mockImplementationOnce(async (_url, { headers }) =>
			headers["If-None-Match"] ? new Response(null, { status: 304 }) : Response.json(catalog));
		expect(await getCodexInstructions("gpt-6-astra")).toBe(messages.instructions_template);
		expect(fetchMock).toHaveBeenLastCalledWith(url, { headers: {} });
		expect(files.get(prompt)).toBe(messages.instructions_template);
	});

	it.each([
		"not json", "null", JSON.stringify({ models: {} }), JSON.stringify({ models: [] }),
		JSON.stringify({ models: [{ slug: "gpt-5.1", model_messages: messages }] }),
		...[
			null, { instructions_template: 42 }, { instructions_template: "  " },
			{ instructions_template: "Template with unspecified variables" },
			{ instructions_template: "Hello {personality}", instructions_variables: null },
			{ instructions_template: "Hello {personality}", instructions_variables: { personality: "friendly" } },
		].map((model_messages) => JSON.stringify({ models: [{ slug: "gpt-6-astra", model_messages }] })),
	])("uses bundled Astra for invalid catalog %s", async (body) => {
		fetchMock.mockResolvedValueOnce(new Response(body));
		expect(await getCodexInstructions("gpt-6-astra")).toBe("Bundled Astra");
		expect(files.has(prompt)).toBe(false);
	});

	it.each([false, true])("uses Astra fallback offline (cached: %s)", async (cached) => {
		if (cached) files.set(prompt, "Cached Astra");
		fetchMock.mockReset().mockRejectedValue(new Error("Offline"));
		expect(await getCodexInstructions("gpt-6-astra")).toBe(cached ? "Cached Astra" : "Bundled Astra");
	});

	it("uses bundled Astra if the release catalog is unavailable", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
		expect(await getCodexInstructions("gpt-6-astra")).toBe("Bundled Astra");
	});

	it.each([
		["gpt-6-astra-instructions.md", "152dfaeeb552876190962be1c12c93d426840ff12691f648261554a7675a6698"],
		["codex-instructions.md", "42842be69650ae563d212695e8d3f3591534908fd8ca33b63f742daf41f88b65"],
	])("preserves upstream bundled text verbatim: %s", async (file, hash) => {
		const bundled = await readFile(new URL(`../lib/prompts/${file}`, import.meta.url));
		expect(createHash("sha256").update(bundled).digest("hex")).toBe(hash);
	});

	it("keeps non-Astra markdown retrieval unchanged", async () => {
		fetchMock.mockResolvedValueOnce(new Response("Legacy instructions"));
		expect(await getCodexInstructions("gpt-5.1")).toBe("Legacy instructions");
		expect(fetchMock).toHaveBeenLastCalledWith(`https://raw.githubusercontent.com/openai/codex/${tag}/codex-rs/core/gpt_5_1_prompt.md`, { headers: {} });
	});
});
