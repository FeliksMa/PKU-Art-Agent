import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PairingManager } from '../bridge/pairing.js';
import { createBridge } from '../bridge/server.js';

const origin = 'https://course.pku.edu.cn';
const verifier = 'a'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('hex');

test('pairing requires explicit approval and verifier; credentials are persistent, hashed, single-exchange', t => {
    const dir = mkdtempSync(join(tmpdir(), 'pku-pair-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const clientsPath = join(dir, 'clients.json');
    const manager = new PairingManager({ origins: [origin], clientsPath });
    const { id } = manager.start({ origin, challenge });
    assert.equal(manager.poll({ id, verifier }).status, 'pending');
    assert.throws(() => manager.poll({ id, verifier: 'b'.repeat(64) }), /校验/);
    assert.throws(() => manager.decide({ id, nonce: 'c'.repeat(64), approve: true }), /无效/);
    manager.decide({ id, nonce: manager.info(id).nonce, approve: true });
    const result = manager.poll({ id, verifier });
    assert.equal(result.status, 'approved'); assert.equal(manager.authenticate('Bearer ' + result.token).origin, origin);
    assert.ok(!readFileSync(clientsPath, 'utf8').includes(result.token));
    assert.ok(new PairingManager({ origins: [origin], clientsPath }).authenticate('Bearer ' + result.token));
    assert.throws(() => manager.poll({ id, verifier }), /过期/);
});

test('denied, expired, unsupported-source and excessive requests cannot yield credentials', () => {
    let now = 0; const manager = new PairingManager({ origins: [origin], now: () => now });
    assert.throws(() => manager.start({ origin: 'https://evil.example', challenge }));
    const denied = manager.start({ origin, challenge });
    manager.decide({ id: denied.id, nonce: manager.info(denied.id).nonce, approve: false });
    assert.deepEqual(manager.poll({ id: denied.id, verifier }), { status: 'denied' });
    const expired = manager.start({ origin, challenge }); now = 180001;
    assert.throws(() => manager.info(expired.id), /过期/);
    for (let i = 0; i < 20; i++) manager.start({ origin, challenge });
    assert.throws(() => manager.start({ origin, challenge }), /过多/);
});

test('approval is local-only; model credential cannot manage keys; local HttpOnly session opens settings', async t => {
    const config = { allowedOrigins: [origin], providers: [{ id: 'test', protocol: 'openai-chat-completions', baseURL: 'https://api.example.com', model: 'test', apiKeyEnv: 'TEST_KEY' }] };
    const server = createBridge({ config, token: 'admin-only', complete: async () => ({ message: { role: 'assistant', content: 'ok' } }) });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body, source = origin, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: source, ...headers }, body: JSON.stringify(body) });
    const start = await (await post('/v1/pair/start', { origin, challenge })).json();
    assert.equal((await post('/v1/pair/info', { id: start.id })).status, 403);
    assert.equal((await post('/v1/pair/start', { origin: 'https://onlineroomse.pku.edu.cn', challenge })).status, 403);
    const info = await (await post('/v1/pair/info', { id: start.id }, base)).json();
    assert.equal((await post('/v1/pair/approve', { id: start.id, nonce: info.nonce, approve: true })).status, 403);
    const approval = await post('/v1/pair/approve', { id: start.id, nonce: info.nonce, approve: true }, base);
    const cookie = approval.headers.get('set-cookie'); assert.match(cookie, /HttpOnly; SameSite=Strict/);
    assert.ok(!(await approval.text()).includes('admin-only'));
    const client = await (await post('/v1/pair/status', { id: start.id, verifier })).json();
    assert.notEqual(client.token, 'admin-only');
    assert.equal((await post('/v1/settings/read', {}, origin, { Authorization: 'Bearer ' + client.token })).status, 403);
    const providers = await fetch(base + '/v1/providers', { headers: { Authorization: 'Bearer ' + client.token } }); assert.equal(providers.status, 200);
    assert.equal((await post('/v1/settings/read', {}, base, { Authorization: 'Bearer ' + client.token })).status, 401);
    assert.equal((await post('/v1/settings/read', {}, base, { Cookie: cookie.split(';')[0] })).status, 200);
    assert.equal((await post('/v1/settings/read', {}, origin, { Cookie: cookie.split(';')[0] })).status, 401);
});
