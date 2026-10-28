// Schemas are sent to the model. Validation and authorization always run locally.
export class ToolRegistry {
    #tools = new Map();
    register(tool) {
        if (!/^pku_[a-z_]+$/.test(tool.name) || this.#tools.has(tool.name)) throw new Error('工具名称无效或重复');
        if (!['read', 'confirm'].includes(tool.permission)) throw new Error('工具必须声明权限');
        if (typeof tool.validate !== 'function' || typeof tool.execute !== 'function') throw new Error('工具缺少校验或执行函数');
        this.#tools.set(tool.name, tool);
        return this;
    }
    schemas() {
        return [...this.#tools.values()].map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    }
    async execute(name, args, context) {
        const tool = this.#tools.get(name);
        if (!tool) throw new Error('未知工具');
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数必须是对象');
        tool.validate(args);
        context.signal?.throwIfAborted();
        if (tool.permission === 'confirm') {
            const accepted = await context.confirm(tool.preview(args), context.signal);
            if (!accepted) return { status: 'denied', message: '用户未批准，未执行操作' };
        }
        context.signal?.throwIfAborted();
        return tool.execute(args, context);
    }
}

export function exactKeys(args, keys) {
    if (Object.keys(args).some(key => !keys.includes(key))) throw new Error('包含不支持的参数');
}

export const emptyParameters = { type: 'object', properties: {}, additionalProperties: false };
