import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicSettings, saveProvider } from '../bridge/settings.js';
import { createBridge } from '../bridge/server.js';
import { completeChat } from '../bridge/providers.js';

const initial = () => ({ allowedOrigins: ['https://course.pku.edu.cn'], providers: [{ id: 'test', label: 'Test', protocol: 'openai-chat-completions', baseURL: 'https://api.example.com/v1', model: 'model', apiKeyEnv: 'TEST_KEY' }] });
const input = (extra = {}) => ({ id: 'test', label: 'Test', baseURL: 'https://api.example.com/v1', model: 'model', enabled: true, apiKey: 'fake-test-key', clearKey: false, ...extra });

test('saved credentials survive reload, never appear in settings responses, and empty input preserves them', t => {
    const dir = mkdtempSync(join(tmpdir(), 'pku-settings-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'config.json'); const config = initial();
    const visible = saveProvider(config, input(), path);
    assert.equal(visible[0].hasKey, true); assert.ok(!JSON.stringify(visible).includes('fake-test-key'));
    const reloaded = JSON.parse(readFileSync(path, 'utf8')); assert.equal(reloaded.providers[0].apiKey, 'fake-test-key');
    saveProvider(reloaded, input({ apiKey: '', enabled: false }), path);
    assert.equal(reloaded.providers[0].apiKey, 'fake-test-key'); assert.equal(publicSettings(reloaded)[0].enabled, false);
    assert.throws(() => saveProvider(reloaded, input({ apiKey: '', baseURL: 'https://another.example/v1' }), path), /重新填写/);
    saveProvider(reloaded, input({ apiKey: '', clearKey: true }), path);
    assert.equal(reloaded.providers[0].apiKey, undefined);
});

test('saved key works without environment variables and can be replaced explicitly', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'pku-settings-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const config = initial(); saveProvider(config, input(), join(dir, 'config.json'));
    await completeChat(config.providers[0], { messages: [], tools: [] }, { env: {}, fetchImpl: async (url, options) => {
        assert.equal(options.headers.Authorization, 'Bearer fake-test-key');
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    } });
});

test('changing vendors does not retain vendor-specific parameters or the previous environment key', t => {
    const dir = mkdtempSync(join(tmpdir(), 'pku-settings-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const config = initial(); config.providers[0].extraBody = { thinking: { type: 'disabled' } };
    saveProvider(config, input({ baseURL: 'https://another.example/v1', apiKey: 'fake-new-vendor-key' }), join(dir, 'config.json'));
    assert.deepEqual(config.providers[0].extraBody, {});
    assert.notEqual(config.providers[0].apiKeyEnv, 'TEST_KEY');
    assert.equal(config.providers[0].apiKey, 'fake-new-vendor-key');
});

test('settings endpoints reject teaching-site and missing origins, require pairing, and persist hot updates', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'pku-settings-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const config = initial(); const server = createBridge({ config, token: 'paired', configPath: join(dir, 'config.json') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, origin, auth = 'Bearer paired', data = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth, ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data) });
    assert.equal((await post('/v1/settings/save', 'https://course.pku.edu.cn', 'Bearer paired', input())).status, 403);
    assert.equal((await post('/v1/settings/save', undefined, 'Bearer paired', input())).status, 403);
    assert.equal((await post('/v1/settings/read', base, 'Bearer wrong')).status, 401);
    const saved = await post('/v1/settings/save', base, 'Bearer paired', input()); assert.equal(saved.status, 200);
    assert.ok(!(await saved.text()).includes('fake-test-key'));
    const listing = await fetch(base + '/v1/providers', { headers: { Authorization: 'Bearer paired' } });
    assert.ok(!(await listing.text()).includes('fake-test-key'));
    const page = await fetch(base + '/settings'); assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.ok(!(await page.text()).includes('fake-test-key'));
    await post('/v1/settings/save', base, 'Bearer paired', input({ enabled: false, apiKey: '' }));
    assert.deepEqual((await (await fetch(base + '/v1/providers', { headers: { Authorization: 'Bearer paired' } })).json()).providers, []);
});
