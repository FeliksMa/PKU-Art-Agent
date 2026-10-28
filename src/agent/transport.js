import { GM_xmlhttpRequest, GM_openInTab } from '$';

export function validateBridgeURL(value) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw new Error('本机服务地址应为 http://127.0.0.1:端口');
    }
    return url.origin;
}

export async function pairWithBridge(settings, { signal, onStatus = () => {}, onApprovalURL = () => {} } = {}) {
    const base = validateBridgeURL(settings.bridgeURL);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.throwIfAborted(); signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 180000);
    try {
        onStatus('正在连接本机服务…');
        const { id } = await bridgeRequest(settings, '/v1/pair/start', { origin: location.origin, challenge }, controller.signal);
        if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('连接响应格式无效');
        const url = `${base}/connect#${id}`;
        onApprovalURL(url); onStatus('请在打开的本机页面点击“允许连接”。');
        if (typeof GM_openInTab === 'function') GM_openInTab(url, { active: true, insert: true });
        while (true) {
            const result = await bridgeRequest(settings, '/v1/pair/status', { id, verifier }, controller.signal);
            if (result.status === 'denied') throw new Error('已取消连接');
            if (result.status === 'approved') {
                if (!/^[a-f0-9]{64}$/.test(result.token)) throw new Error('连接响应格式无效');
                return result.token;
            }
            await new Promise((resolve, reject) => {
                const onAbort = () => { clearTimeout(timer); reject(new DOMException('连接已取消或超时', 'AbortError')); };
                const timer = setTimeout(() => { controller.signal.removeEventListener('abort', onAbort); resolve(); }, 1500);
                controller.signal.addEventListener('abort', onAbort, { once: true });
                if (controller.signal.aborted) onAbort();
            });
        }
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export function bridgeRequest(settings, path, body, signal) {
    const base = validateBridgeURL(settings.bridgeURL);
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest !== 'function') return reject(new Error('需要支持 GM_xmlhttpRequest 的 Tampermonkey')); 
        let request;
        const cleanup = () => signal?.removeEventListener('abort', abort);
        const fail = error => { cleanup(); reject(error); };
        const abort = () => { request?.abort(); fail(new DOMException('已停止', 'AbortError')); };
        request = GM_xmlhttpRequest({
            method: body ? 'POST' : 'GET', url: `${base}${path}`,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}` },
            ...(body ? { data: JSON.stringify(body) } : {}),
            anonymous: true, timeout: 95000,
            onload(response) {
                cleanup();
                try {
                    const data = JSON.parse(response.responseText);
                    if (response.status < 200 || response.status >= 300) throw new Error(data.error || `本机服务 HTTP ${response.status}`);
                    resolve(data);
                } catch (error) { reject(error); }
            },
            onerror: () => fail(new Error('无法连接本机服务，请确认服务已启动且油猴已允许访问 127.0.0.1')),
            ontimeout: () => fail(new Error('模型请求超时，请重试')),
            onabort: () => fail(new DOMException('已停止', 'AbortError')),
        });
        signal?.addEventListener('abort', abort, { once: true });
    });
}
