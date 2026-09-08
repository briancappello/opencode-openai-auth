import { afterEach, describe, expect, it, vi } from 'vitest';
import { transformRequestBody, normalizeModel } from '../lib/request/request-transformer.js';
import { transformRequestForCodex } from '../lib/request/fetch-helpers.js';
import * as prompts from '../lib/prompts/codex.js';
import { OpenAIAuthPlugin } from '../index.js';
import modern from '../config/opencode-modern.json';
import legacy from '../config/opencode-legacy.json';
import type { RequestBody, UserConfig } from '../lib/types.js';

afterEach(() => vi.restoreAllMocks());

describe('Service tier', () => {
	it.each([
		['priority', 'priority'], ['fast', 'priority'], ['flex', 'flex'],
		['auto', 'auto'], ['default', undefined], [undefined, undefined],
	])('maps configuration %s to wire tier %s without changing reasoning', async (serviceTier, expected) => {
		const result = await transformRequestBody(
			{ model: 'gpt-6-astra', reasoning: { effort: 'high' } }, 'instructions',
			{ global: { serviceTier }, models: {} } as UserConfig, false,
		);
		expect(result.service_tier).toBe(expected);
		expect(result.model).toBe('gpt-6-astra');
		expect(result.reasoning?.effort).toBe('high');
	});

	it.each([
		[{ service_tier: 'default', providerOptions: { openai: { serviceTier: 'priority' } } }, undefined],
		[{ service_tier: 'fast' }, 'priority'],
		[{ service_tier: 'flex' }, 'flex'],
		[{ providerOptions: { openai: { serviceTier: 'fast' } } }, 'priority'],
		[{}, undefined],
	])('prefers body, then provider options, then model options: %j', async (body, expected) => {
		const result = await transformRequestBody(
			{ model: 'gpt-6-astra', ...body } as RequestBody, 'instructions',
			{ global: { serviceTier: 'priority' }, models: { 'gpt-6-astra': { options: { serviceTier: 'default' } } } } as UserConfig, false,
		);
		expect(result.service_tier).toBe(expected);
	});

	it.each(['turbo', '', 1, true, {}, []])('omits invalid tier %j rather than enabling Fast', async (serviceTier) => {
		const result = await transformRequestBody(
			{ model: 'gpt-6-astra', service_tier: serviceTier } as RequestBody, 'instructions',
			{ global: { serviceTier: 'priority' }, models: {} } as UserConfig, false,
		);
		expect(result).not.toHaveProperty('service_tier');
	});

	it('serializes Fast into the outgoing request and omits an explicit standard override', async () => {
		vi.spyOn(prompts, 'getCodexInstructions').mockResolvedValue('Official Astra instructions');
		for (const service_tier of [undefined, 'default']) {
			const result = await transformRequestForCodex(
				{ body: JSON.stringify({ model: 'gpt-6-astra', service_tier }) },
				'https://chatgpt.com/backend-api/codex/responses',
				{ global: {}, models: { 'gpt-6-astra': { options: { serviceTier: 'priority' } } } } as UserConfig, false,
			);
			const wire = JSON.parse(result!.updatedInit.body as string);
			expect(wire).toMatchObject({ model: 'gpt-6-astra', instructions: 'Official Astra instructions', store: false, stream: true });
			expect(wire.service_tier).toBe(service_tier ? undefined : 'priority');
		}
	});

	it('exposes an opt-in Fast variant in registration and the modern preset', async () => {
		const hooks = await OpenAIAuthPlugin({} as any);
		const config: any = {};
		await hooks.config?.(config);
		const astra = config.provider.openai.models['gpt-6-astra'];
		expect(astra.variants.fast).toEqual({ serviceTier: 'priority' });
		expect(astra.variants).toEqual(modern.provider.openai.models['gpt-6-astra'].variants);
		expect(astra.options?.serviceTier).toBeUndefined();
		expect(modern.provider.openai.options).not.toHaveProperty('serviceTier');
	});

	it('keeps the legacy Fast preset on Astra instead of falling back to GPT-5.1', async () => {
		const id = 'gpt-6-astra-fast';
		expect(normalizeModel(id)).toBe('gpt-6-astra');
		expect(normalizeModel(`openai/${id}`)).toBe('gpt-6-astra');
		const result = await transformRequestBody(
			{ model: id }, 'instructions',
			{ global: legacy.provider.openai.options, models: legacy.provider.openai.models } as UserConfig, false,
		);
		expect(result).toMatchObject({ model: 'gpt-6-astra', service_tier: 'priority' });
		expect(legacy.provider.openai.options).not.toHaveProperty('serviceTier');
	});
});
