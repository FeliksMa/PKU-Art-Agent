import { GM_getValue, GM_setValue } from '$';
import { bridgeRequest, validateBridgeURL, pairWithBridge } from './transport.js';
import { PageCatalog } from './page.js';
import { downloadAttachment, DownloadQueue } from './downloads.js';
import { createPageTools } from './tools.js';
import { runAgent } from './runner.js';
import { mountAgentPanel } from './panel.js';

const SETTINGS_KEY = 'PKU_ART_AGENT_SETTINGS_V1';
const DEFAULTS = { enabled: false, bridgeURL: 'http://127.0.0.1:17321', token: '', providerId: '' };

export function initializeAgent() {
    if (window.top !== window.self || !['course.pku.edu.cn', 'onlineroomse.pku.edu.cn'].includes(location.hostname)) return;
    const mount = () => {
        if (document.getElementById('pku-art-agent')) return;
        if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function') return;
        let settings;
        try { settings = { ...DEFAULTS, ...GM_getValue(SETTINGS_KEY, {}) }; } catch { settings = { ...DEFAULTS }; }
        let running;
        let ui;
        const queue = new DownloadQueue(downloadAttachment, jobs => ui?.renderJobs(jobs));
        ui = mountAgentPanel({
            settings,
            save(next) {
                validateBridgeURL(next.bridgeURL);
                if (next.enabled && next.token.trim().length < 32) throw new Error('请先点击“连接并配置模型”');
                settings = { ...next, token: next.token.trim() };
                GM_setValue(SETTINGS_KEY, settings);
                if (!settings.enabled) { running?.abort(); queue.cancelAll(); }
            },
            async connect(next) {
                validateBridgeURL(next.bridgeURL);
                return (await bridgeRequest(next, '/v1/providers')).providers;
            },
            async pair(next, options) {
                const credential = await pairWithBridge(next, options);
                const list = (await bridgeRequest({ ...next, token: credential }, '/v1/providers')).providers;
                settings = { ...next, token: credential, enabled: true, providerId: list.some(p => p.id === next.providerId) ? next.providerId : list[0]?.id || '' };
                GM_setValue(SETTINGS_KEY, settings);
                return settings;
            },
            preview() { return new PageCatalog().snapshot(); },
            async run(prompt) {
                if (!settings.enabled) throw new Error('请先在设置中启用助手并保存');
                if (!settings.providerId) throw new Error('请先连接服务、选择模型并保存设置');
                running = new AbortController();
                const catalog = new PageCatalog();
                try {
                    await runAgent({
                        prompt, signal: running.signal,
                        registry: createPageTools(catalog, queue),
                        complete: body => bridgeRequest(settings, '/v1/chat', { providerId: settings.providerId, messages: body.messages, tools: body.tools }, body.signal),
                        confirm: ui.confirm,
                        onEvent: ui.onEvent,
                    });
                } finally { running = undefined; }
            },
            stop() { running?.abort(); },
            cancelDownloads() { queue.cancelAll(); },
        });
        window.addEventListener('beforeunload', () => { running?.abort(); queue.cancelAll(); });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
}
