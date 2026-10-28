import { panelStyles as CSS } from './panel-style.js';

function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
}

function spark() {
    const wrapper = element('span', undefined, 'spark');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z');
    path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linejoin', 'round');
    svg.append(path); wrapper.append(svg); return wrapper;
}

export function mountAgentPanel(callbacks) {
    const host = element('div'); host.id = 'pku-art-agent';
    const syncTheme = () => host.toggleAttribute('data-dark', document.documentElement.classList.contains('pku-art-dark'));
    syncTheme();
    window.addEventListener('pku-art-theme-change', syncTheme);
    const root = host.attachShadow({ mode: 'closed' });
    const style = element('style', CSS); root.append(style);
    const launch = element('button', undefined, 'launch'); launch.append(spark(), document.createTextNode('课程助手')); launch.setAttribute('aria-label', '打开 PKU Art 课程助手');
    const panel = element('section', undefined, 'panel'); panel.hidden = true; panel.setAttribute('aria-label', 'PKU Art 课程助手');
    const bar = element('div', undefined, 'bar');
    const heading = element('div', undefined, 'brand'); heading.append(element('strong', '课程助手'), element('small', 'PKU ART / ASSISTANT'));
    const settingsButton = element('button', '设置');
    const toggle = element('button', callbacks.settings.enabled ? '已开启' : '已关闭');
    toggle.setAttribute('aria-label', '开关课程助手'); toggle.setAttribute('aria-pressed', String(callbacks.settings.enabled));
    const close = element('button', '收起');
    bar.append(spark(), heading, toggle, settingsButton, close);
    const body = element('div', undefined, 'body');
    const intro = element('div', undefined, 'welcome');
    intro.append(element('span', 'LESS BUSYWORK, MORE LEARNING', 'eyebrow'), element('h2', '把琐事交给助手。'), element('p', '梳理作业要求、查找课程资料，\n也可以帮你安排附件下载。'));
    const suggestions = element('div', undefined, 'suggestions');
    intro.append(suggestions);
    const log = element('div'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
    const status = element('p', callbacks.settings.enabled ? `已启用 · ${callbacks.settings.providerId} · 每次任务需授权共享内容` : '助手默认关闭，请先在设置中连接模型。', 'meta'); status.setAttribute('role', 'status');
    const jobs = element('div');
    const cancelDownloads = element('button', '停止全部附件下载'); cancelDownloads.hidden = true;
    cancelDownloads.onclick = () => callbacks.cancelDownloads();
    body.append(intro, log, status, jobs, cancelDownloads);
    const settings = element('div', undefined, 'settings'); settings.hidden = true;
    settings.append(element('h2', '连接你的模型'), element('p', '通过本机服务连接，密钥留在你的电脑上。', 'note'));
    const form = element('form');
    const enabledLabel = element('label'); const enabled = element('input'); enabled.type = 'checkbox'; enabled.checked = callbacks.settings.enabled;
    enabledLabel.append(enabled, document.createTextNode(' 启用课程助手'));
    function field(label, type, value) {
        const wrapper = element('label', label, 'field'); const input = element('input'); input.type = type; input.value = value; wrapper.append(input); form.append(wrapper); return input;
    }
    form.append(enabledLabel);
    const address = field('本机服务地址', 'url', callbacks.settings.bridgeURL);
    const token = field('配对码（不是模型 API Key）', 'password', callbacks.settings.token); token.autocomplete = 'off';
    const providerLabel = element('label', '模型配置', 'field');
    const providers = element('select'); providerLabel.append(providers); form.append(providerLabel);
    const addProvider = (id, label) => { const option = element('option', label); option.value = id; providers.append(option); };
    addProvider(callbacks.settings.providerId, callbacks.settings.providerId || '请先连接服务');
    const settingsNote = element('p', 'API Key 在本机模型设置页保存一次即可，重启后自动读取。此处只保存配对码与模型选择。', 'note');
    const manage = element('a', '管理模型与 API Key（本机设置页）'); manage.target = '_blank'; manage.rel = 'noopener noreferrer';
    const updateManageLink = () => {
        try { const url = new URL(address.value.trim()); if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port) throw new Error(); manage.href = `${url.origin}/settings#${encodeURIComponent(token.value.trim())}`; }
        catch { manage.removeAttribute('href'); }
    };
    address.addEventListener('input', updateManageLink); token.addEventListener('input', updateManageLink); updateManageLink();
    const connect = element('button', '连接并刷新模型'); connect.type = 'button';
    const save = element('button', '保存设置', 'primary'); save.type = 'submit';
    const settingsStatus = element('p', '', 'meta'); settingsStatus.setAttribute('role', 'status');
    const actions = element('div', undefined, 'row'); actions.append(connect, save);
    form.append(settingsNote, manage, actions, settingsStatus); settings.append(form); body.append(settings);
    const compose = element('form', undefined, 'compose');
    const prompt = element('textarea'); prompt.placeholder = '例如：整理本页的作业要求，列出可下载附件'; prompt.maxLength = 4000; prompt.setAttribute('aria-label', '向课程助手发送任务');
    const quickModel = element('select'); quickModel.setAttribute('aria-label', '切换助手模型');
    const modelOption = element('option', callbacks.settings.providerId || '请先配置模型'); modelOption.value = callbacks.settings.providerId || ''; quickModel.append(modelOption);
    const consentLabel = element('label', undefined, 'note'); const consent = element('input'); consent.type = 'checkbox';
    consentLabel.append(consent, document.createTextNode(' 本次允许将当前页及同源内嵌页的正文、资源清单发送给所选模型'));
    const controls = element('div', undefined, 'row');
    const preview = element('button', '预览共享内容'); preview.type = 'button';
    preview.id = 'agent-preview';
    const send = element('button', '发送', 'primary'); send.type = 'submit';
    const stop = element('button', '停止'); stop.type = 'button'; stop.disabled = true;
    controls.append(preview, element('span', '', 'grow'), stop, send);
    compose.append(quickModel, prompt, consentLabel, controls); panel.append(bar, body, compose); root.append(launch, panel); document.body.append(host);
    for (const [label, text] of [
        ['整理作业要求', '请阅读本页，整理作业要求、截止时间和提交方式，附上来源；没有明确写出的内容请标为待确认。'],
        ['查看课程附件', '列出本页的课程附件，按用途分类；先不要下载。'],
        ['整理录播入口', '整理本页的录播入口，展示可打开的播放页清单。'],
    ]) {
        const button = element('button', label); button.append(element('span', '↗')); button.type = 'button';
        button.onclick = () => { prompt.value = text; prompt.focus(); }; suggestions.append(button);
    }

    function appendMessage(text, type = '') {
        const item = element('div', text, `message ${type}`); log.append(item);
        while (log.children.length > 35) log.firstElementChild.remove();
        body.scrollTop = body.scrollHeight;
        return item;
    }
    function currentSettings() { return { enabled: enabled.checked, bridgeURL: address.value.trim(), token: token.value.trim(), providerId: providers.value }; }
    function updateToggle() { toggle.textContent = enabled.checked ? '已开启' : '已关闭'; toggle.setAttribute('aria-pressed', String(enabled.checked)); }
    toggle.onclick = () => {
        try { const next = { ...currentSettings(), enabled: !enabled.checked }; callbacks.save(next); enabled.checked = next.enabled; callbacks.settings = next; updateToggle(); status.textContent = next.enabled ? '助手已开启，使用已保存的模型配置。' : '助手已关闭，当前任务与附件队列已停止。'; }
        catch (error) { status.textContent = error.message; }
    };
    quickModel.onchange = () => {
        try { providers.value = quickModel.value; const next = currentSettings(); callbacks.save(next); callbacks.settings = next; status.textContent = `已切换模型：${quickModel.selectedOptions[0].textContent}`; }
        catch (error) { status.textContent = error.message; }
    };
    function showSettings(show) { settings.hidden = !show; log.hidden = show; intro.hidden = show; compose.hidden = show; jobs.hidden = show; status.hidden = show; }
    launch.onclick = () => { panel.hidden = false; launch.hidden = true; prompt.focus(); if (token.value.trim()) void refreshModels(false); };
    close.onclick = () => { panel.hidden = true; launch.hidden = false; launch.focus(); };
    settingsButton.onclick = () => showSettings(settings.hidden);
    async function refreshModels(showStatus = true) {
        connect.disabled = true; if (showStatus) settingsStatus.textContent = '正在连接…';
        try {
            const list = await callbacks.connect(currentSettings());
            const previous = providers.value; providers.replaceChildren();
            for (const p of list) addProvider(p.id, `${p.label} · ${p.model}`);
            if (list.some(p => p.id === previous)) providers.value = previous;
            quickModel.replaceChildren();
            for (const p of list) { const option = element('option', `${p.label} · ${p.model}`); option.value = p.id; quickModel.append(option); }
            if (list.some(p => p.id === previous)) quickModel.value = previous;
            else { const placeholder = element('option', '请选择模型'); placeholder.value = ''; quickModel.prepend(placeholder); quickModel.value = ''; }
            if (showStatus) settingsStatus.textContent = list.length ? '已连接。选择模型后保存。' : '没有已启用的模型配置，请在本机设置页启用模型。';
        } catch (error) { if (showStatus) settingsStatus.textContent = error.message; else status.textContent = '本机服务未连接。电脑重启后请双击“启动课程助手”。已保存的密钥无需重新填写。'; }
        finally { connect.disabled = false; }
    }
    connect.onclick = () => refreshModels();
    form.onsubmit = event => {
        event.preventDefault();
        try { callbacks.save(currentSettings()); callbacks.settings = currentSettings(); quickModel.value = providers.value; updateToggle(); settingsStatus.textContent = '已保存'; showSettings(false); status.textContent = enabled.checked ? `已启用 · ${providers.value} · 每次任务需授权共享内容` : '助手已关闭'; }
        catch (error) { settingsStatus.textContent = error.message; }
    };
    preview.onclick = () => {
        const item = appendMessage('共享内容预览（尚未发送）');
        const pre = element('pre', JSON.stringify(callbacks.preview(), null, 2), 'preview'); item.append(pre);
    };
    stop.onclick = () => callbacks.stop();
    compose.onsubmit = async event => {
        event.preventDefault();
        const text = prompt.value.trim();
        if (!text || send.disabled) return;
        if (!consent.checked) { status.textContent = '请先预览并勾选本次内容共享授权'; return; }
        appendMessage(text, 'user'); prompt.value = ''; send.disabled = true; stop.disabled = false; settingsButton.disabled = true; quickModel.disabled = true;
        try { await callbacks.run(text); status.textContent = '本次任务结束。附件下载状态请查看队列。'; }
        catch (error) { status.textContent = error.name === 'AbortError' ? '已停止模型任务；附件队列可单独停止。' : error.message; }
        finally { consent.checked = false; send.disabled = false; stop.disabled = true; settingsButton.disabled = false; quickModel.disabled = false; }
    };
    return {
        onEvent(event) {
            if (event.type === 'assistant') appendMessage(event.text);
            else if (event.type === 'recordings') {
                const block = appendMessage(event.items.length ? '录播入口：打开播放页后，点击原有下载按钮。' : '本页没有发现录播入口。');
                for (const item of event.items) {
                    const row = element('div'); const link = element('a', item.name); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link); block.append(row);
                }
            } else status.textContent = event.text;
        },
        confirm(text, signal) {
            return new Promise(resolve => {
                const block = element('div', undefined, 'confirm');
                block.append(element('strong', '请确认具体操作'), element('pre', text));
                const accept = element('button', '同意执行', 'primary'); const decline = element('button', '拒绝');
                const row = element('div', undefined, 'row'); row.append(accept, decline); block.append(row); log.append(block); body.scrollTop = body.scrollHeight;
                const finish = accepted => { signal?.removeEventListener('abort', abort); block.remove(); resolve(accepted); };
                const abort = () => finish(false);
                accept.onclick = () => finish(true); decline.onclick = () => finish(false);
                signal?.addEventListener('abort', abort, { once: true });
                if (signal?.aborted) finish(false);
            });
        },
        renderJobs(items) {
            jobs.replaceChildren();
            const labels = { queued: '排队中', running: '下载中', completed: '已完成', failed: '失败，可重新请求下载', cancelled: '已取消' };
            for (const job of items) jobs.append(element('div', `${job.name} · ${labels[job.status]}`, 'job'));
            cancelDownloads.hidden = !items.some(job => ['queued', 'running'].includes(job.status));
        },
    };
}
