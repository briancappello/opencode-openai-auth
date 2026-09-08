import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAI } from '@ai-sdk/openai';
import { OpenAIAuthPlugin } from '../index.js';
import * as prompts from '../lib/prompts/codex.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('OpenCode SDK option boundary', () => {
	it.each(['priority', 'fast', 'default', undefined])('preserves selected %s tier and reasoning through SDK 2.0.71', async (serviceTier) => {
		vi.spyOn(prompts, 'getCodexInstructions').mockResolvedValue('Official Astra');
		vi.stubEnv('CODEX_MODE', '0');
		const wire: any[] = [];
		vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
			wire.push(JSON.parse(init.body));
			return new Response('', { headers: { 'content-type': 'text/event-stream' } });
		}));
		const hooks = await OpenAIAuthPlugin({} as any);
		const access = `test.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' } })).toString('base64url')}.test`;
		const transport: any = await hooks.auth!.loader!(async () => ({ type: 'oauth', access, refresh: 'test', expires: Date.now() + 60000 }), {} as any);
		const model = createOpenAI({ apiKey: 'test', baseURL: transport.baseURL, fetch: transport.fetch }).responses('gpt-6-astra');
		const metadata = { userTag: 'keep' };
		const output: any = { options: { serviceTier, reasoningEffort: 'xhigh', reasoningSummary: 'detailed', metadata } };
		await hooks['chat.params']?.({ model: { providerID: 'openai' } } as any, output);
		await model.doStream({ prompt: [], providerOptions: { openai: output.options } });
		expect(wire).toHaveLength(1);
		expect(wire[0]).toMatchObject({ model: 'gpt-6-astra', reasoning: { effort: 'xhigh', summary: 'detailed' }, metadata: { userTag: 'keep' } });
		expect(wire[0].service_tier).toBe(serviceTier === 'priority' || serviceTier === 'fast' ? 'priority' : undefined);
		expect(wire[0].metadata).toEqual(metadata);
		expect(metadata).toEqual({ userTag: 'keep' });
	});

	it('does not modify API-key requests', async () => {
		const hooks = await OpenAIAuthPlugin({} as any);
		await hooks.auth!.loader!(async () => ({ type: 'api', key: 'test' }), {} as any);
		const output: any = { options: { serviceTier: 'priority' } };
		await hooks['chat.params']?.({ model: { providerID: 'openai' } } as any, output);
		expect(output).toEqual({ options: { serviceTier: 'priority' } });
	});

	it('isolates concurrent selections and overrides configured priority with standard', async () => {
		vi.spyOn(prompts, 'getCodexInstructions').mockResolvedValue('Official Astra');
		vi.stubEnv('CODEX_MODE', '0');
		const wire: any[] = [];
		const backend = vi.fn(async (_url, init) => {
			wire.push(JSON.parse(init.body));
			return new Response('', { headers: { 'content-type': 'text/event-stream' } });
		});
		vi.stubGlobal('fetch', backend);
		const hooks = await OpenAIAuthPlugin({} as any);
		const access = `test.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' } })).toString('base64url')}.test`;
		const transport: any = await hooks.auth!.loader!(async () => ({ type: 'oauth', access, refresh: 'test', expires: Date.now() + 60000 }), { options: { serviceTier: 'priority' } } as any);
		const model = createOpenAI({ apiKey: 'test', baseURL: transport.baseURL, fetch: transport.fetch }).responses('gpt-6-astra');
		await Promise.all(['fast', 'default'].map(async (serviceTier) => {
			const output: any = { options: { serviceTier } };
			await hooks['chat.params']?.({ model: { providerID: 'openai' } } as any, output);
			await model.doStream({ prompt: [], providerOptions: { openai: output.options } });
		}));
		expect(wire.map((body) => body.service_tier)).toEqual(expect.arrayContaining(['priority', undefined]));
		expect(wire).toHaveLength(2);
		for (const body of wire) expect(body).not.toHaveProperty('metadata');
		const other: any = { options: { serviceTier: 'fast' } };
		await hooks['chat.params']?.({ model: { providerID: 'other' } } as any, other);
		expect(other).toEqual({ options: { serviceTier: 'fast' } });
		backend.mockClear();
		for (const value of ['not json', 'null', '[]', '{"reasoningEffort":42}']) {
			await expect(transport.fetch('https://chatgpt.com/backend-api/responses', {
				body: JSON.stringify({ model: 'gpt-6-astra', metadata: { _opencode_codex_options: value } }),
			})).rejects.toThrow();
		}
		expect(backend).not.toHaveBeenCalled();
	});
});
