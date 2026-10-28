import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

const hash = value => createHash('sha256').update(value).digest('hex');
const valid = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const equal = (a, b) => valid(a) && valid(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

// The short-lived approval URL alone cannot redeem a credential: the requesting
// userscript must also prove possession of its verifier (PKCE-style challenge).
export class PairingManager {
    constructor({ origins, clientsPath, now = Date.now }) {
        this.origins = new Set(origins); this.clientsPath = clientsPath; this.now = now;
        this.pending = new Map();
        this.clients = clientsPath && existsSync(clientsPath) ? JSON.parse(readFileSync(clientsPath, 'utf8')) : [];
        if (!Array.isArray(this.clients) || this.clients.some(c => !valid(c.hash) || !this.origins.has(c.origin))) throw new Error('本机连接记录格式无效');
    }
    start({ origin, challenge }) {
        for (const [id, request] of this.pending) if (request.expiresAt <= this.now()) this.pending.delete(id);
        if (!this.origins.has(origin) || !valid(challenge)) fail('连接请求无效');
        if (this.pending.size >= 20) fail('连接请求过多，请稍后重试', 429);
        const id = randomBytes(32).toString('hex');
        this.pending.set(id, { origin, challenge, nonce: randomBytes(32).toString('hex'), status: 'pending', expiresAt: this.now() + 180000 });
        return { id, expiresIn: 180 };
    }
    get(id) {
        const request = valid(id) && this.pending.get(id);
        if (!request || request.expiresAt <= this.now()) { this.pending.delete(id); fail('连接请求已过期，请回到助手重新连接', 410); }
        return request;
    }
    info(id) {
        const r = this.get(id);
        return { origin: r.origin, nonce: r.nonce, status: r.status };
    }
    decide({ id, nonce, approve }) {
        const r = this.get(id);
        if (!equal(nonce, r.nonce) || typeof approve !== 'boolean') fail('连接确认无效', 403);
        if (r.status !== 'pending') fail('该请求已处理', 409);
        if (!approve) { r.status = 'denied'; return; }
        const credential = randomBytes(32).toString('hex');
        const next = [...this.clients.slice(-19), { origin: r.origin, hash: hash(credential), createdAt: this.now() }];
        if (this.clientsPath) {
            writeFileSync(`${this.clientsPath}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
            renameSync(`${this.clientsPath}.tmp`, this.clientsPath);
        }
        this.clients = next; r.credential = credential; r.status = 'approved';
    }
    poll({ id, verifier }) {
        const r = this.get(id);
        if (!valid(verifier) || !equal(hash(verifier), r.challenge)) fail('连接凭证校验失败', 403);
        if (r.status === 'pending') return { status: 'pending' };
        this.pending.delete(id);
        return r.status === 'approved' ? { status: 'approved', token: r.credential } : { status: 'denied' };
    }
    authenticate(authorization) {
        const credential = authorization?.replace(/^Bearer /, '');
        if (!valid(credential)) return null;
        const digest = hash(credential);
        return this.clients.find(c => equal(c.hash, digest)) || null;
    }
}
