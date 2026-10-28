import { ToolRegistry, exactKeys, emptyParameters } from './registry.js';
import { safeResourceURL, isReadablePage, publicURL, extractText } from './page.js';

const idParameters = { type: 'object', properties: { id: { type: 'string', description: '从 pku_list_resources 获得的资源 ID' } }, required: ['id'], additionalProperties: false };

export function createPageTools(catalog, queue) {
    const registry = new ToolRegistry();
    registry.register({ name: 'pku_read_current_page', permission: 'read', description: '读取用户本次允许共享的当前页面。不能读取附件正文。', parameters: emptyParameters,
        validate: args => exactKeys(args, []), execute: () => catalog.snapshot() });
    registry.register({ name: 'pku_list_resources', permission: 'read', description: '列出当前页面及已批准读取页面的附件、录播入口、可读取课程页面。', parameters: emptyParameters,
        validate: args => exactKeys(args, []), execute: () => catalog.list() });
    registry.register({ name: 'pku_read_linked_page', permission: 'confirm', description: '读取已发现的课程页面，需要用户单独同意将该页文本发送给模型。', parameters: idParameters,
        validate(args) { exactKeys(args, ['id']); catalog.get(args.id, ['page']); },
        preview: args => { const item = catalog.get(args.id, ['page']); return `读取并发送以下页面的正文给所选模型：\n${item.name}\n${publicURL(item.url)}`; },
        async execute(args, { signal }) {
            const item = catalog.get(args.id, ['page']);
            const url = safeResourceURL(item.url);
            if (!isReadablePage(url) || url.origin !== catalog.doc.location.origin) throw new Error('仅支持同源只读页面');
            const controller = new AbortController();
            const abort = () => controller.abort();
            signal.addEventListener('abort', abort, { once: true });
            const timeout = setTimeout(abort, 20000);
            try {
                const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal, redirect: 'error' });
                if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('页面不可读取');
                const reader = response.body.getReader();
                const chunks = []; let size = 0;
                try {
                    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) throw new Error('页面过大'); chunks.push(value); }
                } finally { await reader.cancel(); }
                const bytes = new Uint8Array(size); let offset = 0;
                for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
                const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html');
                if (doc.querySelector('input[type="password"]') || /\/login|\/iaaa/i.test(response.url)) throw new Error('请重新登录');
                catalog.addDocument(doc, item.url);
                return { title: doc.title, source: publicURL(item.url), text: extractText(doc), resources: catalog.list() };
            } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
        } });
    registry.register({ name: 'pku_download_attachments', permission: 'confirm', description: '将指定课程附件加入本页下载队列，用户确认后执行。返回 queued 不代表完成。',
        parameters: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 } }, required: ['ids'], additionalProperties: false },
        validate(args) {
            exactKeys(args, ['ids']);
            if (!Array.isArray(args.ids) || !args.ids.length || args.ids.length > 20 || new Set(args.ids).size !== args.ids.length) throw new Error('请选择 1–20 个不同附件');
            args.ids.forEach(id => catalog.get(id, ['attachment']));
        },
        preview: args => `下载以下 ${args.ids.length} 个课程附件到浏览器下载目录：\n${args.ids.map(id => catalog.get(id, ['attachment']).name).join('\n')}\n保持页面打开；重名处理由浏览器决定。`,
        execute: args => ({ status: 'queued', jobIds: queue.enqueue(args.ids.map(id => catalog.get(id, ['attachment']))) }) });
    registry.register({ name: 'pku_download_status', permission: 'read', description: '检查本页附件下载队列的实际状态。', parameters: emptyParameters,
        validate: args => exactKeys(args, []), execute: () => queue.list() });
    registry.register({ name: 'pku_prepare_recordings', permission: 'read', description: '整理当前页发现的录播入口，显示供用户点击的播放页清单。不会开始下载或进行转写；批量跨页录播下载尚未实现。', parameters: emptyParameters,
        validate: args => exactKeys(args, []),
        execute(args, { onEvent }) {
            catalog.refresh();
            const items = [...catalog.items.values()].filter(item => item.kind === 'recording');
            onEvent({ type: 'recordings', items });
            return { status: 'ready_for_user', count: items.length, note: '已展示录播入口；用户需打开播放页使用现有下载按钮。没有开始批量下载。' };
        } });
    return registry;
}
