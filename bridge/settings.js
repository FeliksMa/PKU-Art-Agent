import { writeFileSync, renameSync } from 'node:fs';
import { validateProviders } from './providers.js';

export function publicSettings(config) {
    return config.providers.map(p => ({ id: p.id, label: p.label || p.id, baseURL: p.baseURL,
        model: p.model, enabled: p.enabled !== false, hasKey: Boolean(p.apiKey), hasEnvironmentKey: Boolean(process.env[p.apiKeyEnv]) }));
}

export function saveProvider(config, input, configPath) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('配置格式无效');
    const allowed = ['id', 'label', 'baseURL', 'model', 'enabled', 'apiKey', 'clearKey'];
    if (Object.keys(input).some(k => !allowed.includes(k))) throw new Error('包含未知配置项');
    for (const field of ['id', 'label', 'baseURL', 'model']) {
        if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 500) throw new Error('名称、地址与模型名称不能为空');
    }
    if (typeof input.enabled !== 'boolean' || typeof input.clearKey !== 'boolean' || typeof input.apiKey !== 'string' || input.apiKey.length > 4096) throw new Error('密钥或开关格式无效');
    const old = config.providers.find(p => p.id === input.id);
    const key = input.apiKey.trim();
    // Never reuse a saved credential silently when its destination changes.
    if (old && old.baseURL !== input.baseURL.trim() && !key && !input.clearKey) throw new Error('修改接口地址时，请重新填写密钥，避免将原密钥发送到新服务');
    const provider = { ...(old || { protocol: 'openai-chat-completions', apiKeyEnv: `PKU_AGENT_${input.id.toUpperCase().replace(/-/g, '_')}_KEY`, maxTokens: 4096, extraBody: {} }),
        id: input.id, label: input.label.trim(), baseURL: input.baseURL.trim(), model: input.model.trim(), enabled: input.enabled };
    if (input.clearKey) delete provider.apiKey;
    else if (key) provider.apiKey = key;
    const next = { ...config, providers: old ? config.providers.map(p => p.id === provider.id ? provider : p) : [...config.providers, provider] };
    validateProviders(next.providers);
    const temp = `${configPath}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 4) + '\n', { mode: 0o600 });
    renameSync(temp, configPath);
    config.providers = next.providers;
    return publicSettings(config);
}
