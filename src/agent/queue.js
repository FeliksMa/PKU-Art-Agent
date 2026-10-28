// The queue is independent of the browser and model provider; download is injected.
export class DownloadQueue {
    constructor(download, onUpdate = () => {}) {
        this.download = download; this.onUpdate = onUpdate; this.jobs = []; this.running = false; this.sequence = 0;
    }
    enqueue(items) {
        if (this.jobs.filter(j => ['queued', 'running'].includes(j.status)).length + items.length > 30) throw new Error('队列最多包含 30 个待执行项目');
        this.jobs = this.jobs.filter(j => ['queued', 'running'].includes(j.status) || this.jobs.indexOf(j) >= this.jobs.length - 70);
        const jobs = items.map(item => ({ id: `d${++this.sequence}`, item, status: 'queued', controller: new AbortController() }));
        this.jobs.push(...jobs);
        void this.pump();
        return jobs.map(j => j.id);
    }
    list() { return this.jobs.map(j => ({ id: j.id, name: j.item.name, status: j.status })); }
    cancelAll() {
        for (const job of this.jobs) if (['queued', 'running'].includes(job.status)) { job.status = 'cancelled'; job.controller.abort(); }
        this.onUpdate(this.list());
    }
    async pump() {
        if (this.running) return;
        this.running = true;
        try {
            let job;
            while ((job = this.jobs.find(j => j.status === 'queued'))) {
                job.status = 'running'; this.onUpdate(this.list());
                try { await this.download(job.item, job.controller.signal); if (job.status !== 'cancelled') job.status = 'completed'; }
                catch { if (job.status !== 'cancelled') job.status = 'failed'; }
                this.onUpdate(this.list());
            }
        } finally { this.running = false; }
    }
}
