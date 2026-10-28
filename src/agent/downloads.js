import { GM_download } from '$';
import { safeResourceURL } from './page.js';
export { DownloadQueue } from './queue.js';

export function safeFileName(name) {
    return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').trim().slice(0, 160) || 'attachment';
}

export function downloadAttachment(item, signal) {
    const url = safeResourceURL(item.url);
    if (url.hostname !== 'course.pku.edu.cn' || !url.pathname.startsWith('/bbcswebdav/')) throw new Error('不是可下载的课程附件');
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        if (typeof GM_download !== 'function') return reject(new Error('当前环境不支持 GM_download'));
        let handle;
        let timer;
        const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
        const fail = () => { cleanup(); reject(new Error('附件下载失败或超时，请检查油猴下载权限')); };
        const abort = () => { handle?.abort(); cleanup(); reject(new DOMException('已停止', 'AbortError')); };
        signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => { handle?.abort(); fail(); }, 10 * 60 * 1000);
        try {
            handle = GM_download({ url: url.href, name: safeFileName(item.name), saveAs: false,
                onload: () => { cleanup(); resolve(); }, onerror: fail, ontimeout: fail });
        } catch { fail(); }
    });
}

