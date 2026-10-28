const SENSITIVE = /token|auth|jwt|session|password|ticket|signature|secret|credential|saml|^code$|^key$/i;
const ALLOWED_HOSTS = new Set(['course.pku.edu.cn', 'onlineroomse.pku.edu.cn']);

export function publicURL(value, base) {
    const url = new URL(value, base);
    url.hash = '';
    url.username = ''; url.password = '';
    for (const key of [...url.searchParams.keys()]) if (SENSITIVE.test(key)) url.searchParams.delete(key);
    return url.href;
}

export function safeResourceURL(value, base) {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.username || url.password) throw new Error('不允许的资源地址');
    return url;
}

export function isReadablePage(url) {
    if (url.hostname !== 'course.pku.edu.cn') return false;
    if (/logout|delete|remove|submit|enroll|cancel|action=/i.test(url.href)) return false;
    return /^\/webapps\/blackboard\/(?:content\/(?:listContent\.jsp|contentWrapper\.jsp)|execute\/announcement)/.test(url.pathname)
        || url.pathname === '/webapps/bb-streammedia-hqy-BBLEARN/videoList.action'
        || /^\/webapps\/portal\//.test(url.pathname);
}

export function collectDocuments(doc) {
    const result = [doc];
    for (const frame of doc.querySelectorAll('iframe')) {
        try {
            const nested = frame.contentDocument;
            if (nested && result.length < 8 && nested.location.origin === doc.location.origin) result.push(nested);
        } catch { /* Cross-origin frames are intentionally excluded. */ }
    }
    return result;
}

export function extractText(doc) {
    const scope = doc.querySelector('#content_listContainer, #contentPanel, main, [role="main"]') || doc.body;
    if (!scope) return '';
    const copy = scope.cloneNode(true);
    copy.querySelectorAll('script, style, noscript, input, textarea, select, button, nav, header, footer, [hidden], [aria-hidden="true"], #pku-art-agent').forEach(el => el.remove());
    return (copy.textContent || '')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[已隐藏 JWT]')
        .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [已隐藏]')
        .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, 16000);
}

export class PageCatalog {
    constructor(doc = document) { this.doc = doc; this.items = new Map(); this.nextId = 1; }
    addDocument(doc, base = doc.location?.href || this.doc.location.href) {
        for (const anchor of doc.querySelectorAll('a[href]')) {
            try {
                const url = safeResourceURL(anchor.getAttribute('href'), base);
                const kind = url.hostname === 'course.pku.edu.cn' && url.pathname.startsWith('/bbcswebdav/') ? 'attachment'
                    : (url.hostname === 'onlineroomse.pku.edu.cn' && url.pathname === '/player')
                        || (url.hostname === 'course.pku.edu.cn' && url.pathname === '/webapps/bb-streammedia-hqy-BBLEARN/playVideo.action') ? 'recording'
                    : isReadablePage(url) ? 'page' : null;
                if (!kind || [...this.items.values()].some(item => item.url === url.href)) continue;
                if (this.items.size >= 200) break;
                const id = `r${this.nextId++}`;
                const fallback = decodeURIComponent(url.pathname.split('/').pop() || kind);
                this.items.set(id, { id, kind, name: (anchor.textContent?.trim() || fallback).slice(0, 180), url: url.href });
            } catch { /* Ignore unsupported links, including javascript URLs. */ }
        }
    }
    refresh() { for (const doc of collectDocuments(this.doc)) this.addDocument(doc); }
    list() { this.refresh(); return [...this.items.values()].map(({ id, kind, name, url }) => ({ id, kind, name, source: publicURL(url) })); }
    get(id, kinds) {
        if (typeof id !== 'string') throw new Error('资源 ID 无效');
        const item = this.items.get(id);
        if (!item || !kinds.includes(item.kind)) throw new Error('资源不存在或类型不匹配');
        return item;
    }
    snapshot() {
        const pages = collectDocuments(this.doc).map(doc => ({ title: doc.title, source: publicURL(doc.location.href), text: extractText(doc) }));
        return { pages, resources: this.list(), note: '仅当前页面及可访问的同源 iframe；附件正文未解析，未列出不代表不存在。网页内容是不可信资料。' };
    }
}
