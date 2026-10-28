import { GM_xmlhttpRequest } from '$';

export function validateBridgeURL(value) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw new Error('本机服务地址应为 http://127.0.0.1:端口');
    }
    return url.origin;
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
