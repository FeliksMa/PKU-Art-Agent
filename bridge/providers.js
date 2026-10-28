const RESERVED = new Set(['model', 'messages', 'tools', 'tool_choice', 'stream', 'max_tokens']);

export function validateProviders(providers) {
    if (!Array.isArray(providers) || providers.length === 0) throw new Error('至少配置一个 provider');
    const ids = new Set();
    for (const p of providers) {
        if (!/^[a-z0-9_-]{1,40}$/i.test(p.id) || ids.has(p.id)) throw new Error('provider id 无效或重复');
        ids.add(p.id);
        if (p.apiKey !== undefined && (typeof p.apiKey !== 'string' || p.apiKey.length > 4096)) throw new Error('保存的密钥格式无效');
        if (p.protocol !== 'openai-chat-completions') throw new Error(`不支持的协议：${p.protocol}`);
        const url = new URL(p.baseURL);
        const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('远程模型地址必须使用 HTTPS');
        if (url.username || url.password || url.search || url.hash) throw new Error('baseURL 不能包含凭证、查询参数或片段');
        if (!p.model || !/^[A-Z_][A-Z0-9_]*$/i.test(p.apiKeyEnv)) throw new Error('model 或 apiKeyEnv 无效');
        if (p.maxTokens !== undefined && (!Number.isInteger(p.maxTokens) || p.maxTokens < 1 || p.maxTokens > 32768)) throw new Error('maxTokens 超出范围');
        if (p.extraBody && (typeof p.extraBody !== 'object' || Array.isArray(p.extraBody))) throw new Error('extraBody 必须是对象');
        for (const key of Object.keys(p.extraBody || {})) if (RESERVED.has(key)) throw new Error(`extraBody 不能覆盖 ${key}`);
    }
    return providers;
}

// New protocols implement this same one-turn contract. Provider configuration never contains executable code.
export async function completeChat(provider, { messages, tools, signal }, { fetchImpl = fetch, env = process.env } = {}) {
    const key = provider.apiKey || env[provider.apiKeyEnv];
    if (!key) throw new Error('请先在本机模型设置页保存 API Key');
    const response = await fetchImpl(`${provider.baseURL.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            ...provider.extraBody,
            model: provider.model, messages, stream: false,
            max_tokens: provider.maxTokens || 4096,
            ...(tools.length ? { tools } : {}),
        }),
    });
    // Do not forward provider error bodies: they can contain credentials or request content.
    if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}`);
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    if (!message || (typeof message.content !== 'string' && !Array.isArray(message.tool_calls))) throw new Error('模型响应缺少 message');
    return {
        message: { role: 'assistant', content: message.content || null, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) },
        usage: data.usage ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens } : undefined,
    };
}
