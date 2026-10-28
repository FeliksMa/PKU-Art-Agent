import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { PageCatalog, extractText, publicURL, safeResourceURL, isReadablePage } from '../src/agent/page.js';
import { createPageTools } from '../src/agent/tools.js';

function page() {
    const { document } = parseHTML(`<html><head><title>测试课程</title></head><body><main>作业：阅读第一章，周五提交。
    <script>privateToken</script><input value="password"><textarea>privateDraft</textarea><div hidden>hiddenSecret</div>
    <a href="/bbcswebdav/pid-1/作业.pdf?token=secret">作业.pdf</a>
    <a href="/webapps/blackboard/content/listContent.jsp?course_id=1">课程内容</a>
    <a href="https://onlineroomse.pku.edu.cn/player?course_id=1&jwt=secret">第一讲录播</a>
    <a href="https://evil.example/bbcswebdav/file">恶意下载</a>
    <a href="javascript:alert(1)">JS</a></main></body></html>`);
    document.location = new URL('https://course.pku.edu.cn/webapps/blackboard/content/listContent.jsp?course_id=1');
    return document;
}

test('page text removes scripts, forms, hidden elements and redacts bearer/JWT values', () => {
    const doc = page();
    const text = extractText(doc);
    assert.ok(text.includes('周五提交'));
    for (const secret of ['privateToken', 'password', 'privateDraft', 'hiddenSecret']) assert.ok(!text.includes(secret));
});

test('catalog only accepts typed PKU resources; model-visible URLs omit tokens', () => {
    const catalog = new PageCatalog(page());
    const resources = catalog.list();
    assert.equal(resources.length, 3);
    assert.deepEqual(resources.map(r => r.kind), ['attachment', 'page', 'recording']);
    assert.ok(!JSON.stringify(resources).includes('secret'));
    assert.ok(catalog.get(resources[0].id, ['attachment']).url.includes('secret'));
    assert.throws(() => catalog.get('r999', ['attachment']));
    assert.throws(() => safeResourceURL('https://course.pku.edu.cn.evil.example/bbcswebdav/x'));
    assert.equal(isReadablePage(new URL('https://course.pku.edu.cn/webapps/blackboard/content/listContent.jsp?action=delete')), false);
    assert.equal(publicURL('https://course.pku.edu.cn/x?course_id=1&JWT=secret'), 'https://course.pku.edu.cn/x?course_id=1');
});

test('download tools require known IDs and exact user approval', async () => {
    let enqueued = 0;
    const catalog = new PageCatalog(page()); catalog.refresh();
    const tools = createPageTools(catalog, { enqueue: () => { enqueued++; return ['d1']; }, list: () => [] });
    await assert.rejects(tools.execute('pku_download_attachments', { ids: ['r999'] }, {}));
    await assert.rejects(tools.execute('pku_download_attachments', { ids: ['r1'], url: 'https://evil.example' }, {}));
    const denied = await tools.execute('pku_download_attachments', { ids: ['r1'] }, { confirm: async () => false });
    assert.equal(denied.status, 'denied'); assert.equal(enqueued, 0);
    const accepted = await tools.execute('pku_download_attachments', { ids: ['r1'] }, { confirm: async preview => { assert.match(preview, /作业.pdf/); return true; } });
    assert.equal(accepted.status, 'queued'); assert.equal(enqueued, 1);
});
