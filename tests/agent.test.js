import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry, emptyParameters } from '../src/agent/registry.js';
import { runAgent } from '../src/agent/runner.js';
import { DownloadQueue } from '../src/agent/queue.js';

const noop = () => {};
const makeTool = execute => ({ name: 'pku_test', permission: 'confirm', description: 'test', parameters: emptyParameters, validate: noop, preview: () => 'specific action', execute });

test('unregistered tools and invalid parameters never execute', async () => {
    const registry = new ToolRegistry();
    await assert.rejects(registry.execute('pku_shell', {}, {}), /未知工具/);
    registry.register(makeTool(noop));
    await assert.rejects(registry.execute('pku_test', [], {}), /参数/);
    assert.throws(() => registry.register(makeTool(noop)), /重复/);
});

test('denial and abort prevent side effects', async () => {
    let executed = 0;
    const registry = new ToolRegistry().register(makeTool(() => executed++));
    assert.equal((await registry.execute('pku_test', {}, { confirm: async () => false })).status, 'denied');
    const controller = new AbortController();
    await assert.rejects(registry.execute('pku_test', {}, { signal: controller.signal, confirm: async () => { controller.abort(); return true; } }), { name: 'AbortError' });
    assert.equal(executed, 0);
});

test('agent executes a tool, feeds actual result back, then finishes', async () => {
    let turns = 0;
    const registry = new ToolRegistry().register(makeTool(() => ({ status: 'queued' })));
    const events = [];
    await runAgent({ prompt: 'do it', registry, confirm: async () => true, signal: new AbortController().signal, onEvent: e => events.push(e),
        complete: async ({ messages }) => {
            if (turns++ === 0) return { message: { role: 'assistant', content: '计划下载', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'pku_test', arguments: '{}' } }] } };
            assert.deepEqual(JSON.parse(messages.at(-1).content), { status: 'queued' });
            return { message: { role: 'assistant', content: '已加入队列' } };
        } });
    assert.equal(turns, 2); assert.equal(events.at(-1).text, '已加入队列');
});

test('malformed tool arguments yield an error result, and loops are bounded', async () => {
    let executed = false;
    const registry = new ToolRegistry().register(makeTool(() => { executed = true; }));
    await assert.rejects(runAgent({ prompt: 'loop', registry, confirm: async () => true, signal: new AbortController().signal, onEvent: noop, maxTurns: 2,
        complete: async ({ messages }) => {
            if (messages.length > 1) assert.equal(JSON.parse(messages.at(-1).content).status, 'error');
            return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'pku_test', arguments: '{broken' } }] } };
        } }), /调用上限/);
    assert.equal(executed, false);
});

test('download queue runs sequentially, distinguishes failure, and reports no URL', async () => {
    const order = [];
    const queue = new DownloadQueue(async item => { order.push(item.name); if (item.name === 'bad') throw new Error('network'); });
    queue.enqueue([{ name: 'good', url: 'secret' }, { name: 'bad' }, { name: 'last' }]);
    while (queue.running) await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(order, ['good', 'bad', 'last']);
    assert.deepEqual(queue.list().map(j => j.status), ['completed', 'failed', 'completed']);
    assert.ok(!JSON.stringify(queue.list()).includes('secret'));
});

test('cancelling a queue aborts active download and prevents queued downloads', async () => {
    let count = 0;
    const queue = new DownloadQueue((item, signal) => { count++; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); });
    queue.enqueue([{ name: 'a' }, { name: 'b' }]); queue.cancelAll();
    while (queue.running) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(count, 1); assert.deepEqual(queue.list().map(j => j.status), ['cancelled', 'cancelled']);
});
