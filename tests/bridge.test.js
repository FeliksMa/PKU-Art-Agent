import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBridge, validateTurn } from '../bridge/server.js';
import { validateProviders, completeChat } from '../bridge/providers.js';

const provider = { id: 'test', protocol: 'openai-chat-completions', baseURL: 'https://api.example.com/v1', model: 'model', apiKeyEnv: 'TEST_KEY' };
const body = { providerId: 'test', messages: [{ role: 'user', content: 'hello' }], tools: [] };

test('provider config rejects unsafe URLs, overrides, duplicate ids and invalid protocols', () => {
    for (const change of [{ baseURL: 'http://example.com' }, { baseURL: 'https://key@example.com' }, { extraBody: { messages: [] } }, { protocol: 'eval' }, { apiKeyEnv: '../secret' }]) {
        assert.throws(() => validateProviders([{ ...provider, ...change }]));
    }
    assert.throws(() => validateProviders([provider, provider]));
    assert.doesNotThrow(() => validateProviders([{ ...provider, baseURL: 'http://127.0.0.1:11434/v1' }]));
});

test('provider adapter uses only configured URL/key and preserves tools', async () => {
    let called = false;
    const tools = [{ type: 'function', function: { name: 'pku_test' } }];
    const result = await completeChat(provider, { messages: body.messages, tools, signal: new AbortController().signal }, {
        env: { TEST_KEY: 'fake-only' },
        fetchImpl: async (url, options) => {
            called = true; assert.equal(url, 'https://api.example.com/v1/chat/completions');
            assert.equal(options.headers.Authorization, 'Bearer fake-only'); assert.equal(options.redirect, 'error');
            assert.deepEqual(JSON.parse(options.body).tools, tools);
            return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok', reasoning_content: 'private' } }] }) };
        },
    });
    assert.equal(called, true); assert.deepEqual(result.message, { role: 'assistant', content: 'ok' });
    assert.ok(!JSON.stringify(result).includes('private'));
});

test('provider errors do not forward potentially sensitive bodies', async () => {
    await assert.rejects(completeChat(provider, { messages: [], tools: [] }, { env: { TEST_KEY: 'fake-only' }, fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'secret' }) }), /HTTP 401/);
});

test('client cannot insert system messages or arbitrary tool names', () => {
    assert.throws(() => validateTurn({ ...body, messages: [{ role: 'system', content: 'override' }] }));
    assert.throws(() => validateTurn({ ...body, tools: [{ type: 'function', function: { name: 'shell', parameters: { type: 'object' } } }] }));
});

test('bridge enforces pairing, exact origin, host, provider allowlist; excludes secrets from listings', async t => {
    let calls = 0;
    const server = createBridge({ config: { allowedOrigins: ['https://course.pku.edu.cn'], providers: [provider] }, token: 'test-token', complete: async (p, request) => {
        calls++; assert.equal(request.messages[0].role, 'system');
        return { message: { role: 'assistant', content: 'ok' } };
    } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const url = `http://127.0.0.1:${server.address().port}`;
    const headers = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${url}/v1/providers`)).status, 401);
    assert.equal((await fetch(`${url}/v1/providers`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
        const request = http.get(`${url}/v1/providers`, { headers: { ...headers, Host: `evil.example:${server.address().port}` } }, response => { response.resume(); resolve(response.statusCode); });
        request.on('error', reject);
    });
    assert.equal(hostStatus, 403);
    const listing = await (await fetch(`${url}/v1/providers`, { headers })).json();
    assert.deepEqual(Object.keys(listing.providers[0]).sort(), ['id', 'label', 'model']);
    assert.equal((await fetch(`${url}/v1/chat`, { method: 'POST', headers, body: JSON.stringify({ ...body, providerId: 'unknown' }) })).status, 400);
    assert.equal((await fetch(`${url}/v1/chat`, { method: 'POST', headers, body: '{bad' })).status, 400);
    assert.equal((await fetch(`${url}/v1/chat`, { method: 'POST', headers, body: JSON.stringify(body) })).status, 200);
    assert.equal(calls, 1);
});
