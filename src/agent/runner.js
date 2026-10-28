export async function runAgent({ prompt, registry, complete, confirm, onEvent, signal, maxTurns = 8 }) {
    // Each task is isolated. No previous task's page text is silently shared again.
    const messages = [{ role: 'user', content: prompt }];
    for (let turn = 0; turn < maxTurns; turn++) {
        signal.throwIfAborted();
        onEvent({ type: 'status', text: `正在处理（${turn + 1}/${maxTurns}）…` });
        const { message } = await complete({ messages, tools: registry.schemas(), signal });
        signal.throwIfAborted();
        if (!message || message.role !== 'assistant') throw new Error('模型返回格式无效');
        const calls = message.tool_calls || [];
        if (!Array.isArray(calls) || calls.length > 8) throw new Error('工具调用数量异常');
        if (message.content) onEvent({ type: 'assistant', text: message.content });
        messages.push(message);
        if (!calls.length) return;
        const ids = new Set();
        for (const call of calls) {
            if (typeof call.id !== 'string' || ids.has(call.id) || call.type !== 'function') throw new Error('工具调用格式无效');
            ids.add(call.id);
            let result;
            onEvent({ type: 'tool', text: `调用 ${call.function?.name || '未知工具'}` });
            try {
                const args = JSON.parse(call.function.arguments);
                result = await registry.execute(call.function.name, args, { confirm, signal, onEvent });
            } catch (error) {
                signal.throwIfAborted();
                // Never return raw download URLs or network exception details to the model.
                result = { status: 'error', message: '工具执行失败：参数不合法、权限不足或页面暂不支持。请缩小范围或让用户检查页面。' };
                onEvent({ type: 'status', text: result.message });
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
    }
    throw new Error('已达到单次任务的调用上限，请缩小任务范围后重试');
}
