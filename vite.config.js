import { defineConfig } from 'vite';
import monkey, { util } from 'vite-plugin-monkey';
import mkcert from 'vite-plugin-mkcert';
import fs from 'fs';
import dotenv from 'dotenv';
import AutoImport from 'unplugin-auto-import/vite';

const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

// 读取并解析 version.env 文件
const envConfig = fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {};
// Forks must not auto-update from the upstream CDN and overwrite local features.
const releaseURLs = envConfig.UPDATE_URL && envConfig.DOWNLOAD_URL
    ? { updateURL: envConfig.UPDATE_URL, downloadURL: envConfig.DOWNLOAD_URL }
    : { updateURL: 'none', downloadURL: 'none' };

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        AutoImport({
            imports: [util.unimportPreset],
        }),
        mkcert(),
        monkey({
            entry: 'src/main.js',
            userscript: {
                icon: 'http://cdn.arthals.ink/Arthals-mcskin.png',
                namespace: envConfig.USERSCRIPT_NAMESPACE || 'pku-art-ai/community',
                name: envConfig.USERSCRIPT_NAME || 'PKU-Art AI (Community)',
                description: '给你一个足够好看的北大网站。',
                match: ['*://*.pku.edu.cn/*'],
                // local development
                // match: ['*://*.pku.edu.cn/*', 'http://localhost:8000/*'],
                'run-at': 'document-start',
                'inject-into': 'page',
                version: envConfig.VERSION || '2.6.27-ai.3',
                ...releaseURLs,
                ...(envConfig.SUPPORT_URL ? { supportURL: envConfig.SUPPORT_URL } : {}),
                connect: ['pku.edu.cn', '127.0.0.1'],
                license: 'GPL-3.0 license',
                author: envConfig.AUTHOR || 'Arthals and community contributors',
                $extra: {
                    'author-blog': 'https://arthals.ink',
                    date,
                },
            },
            server: { mountGmApi: true },
        }),
    ],
});
