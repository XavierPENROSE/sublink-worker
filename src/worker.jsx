import { createApp } from './app/createApp.jsx';
import { createCloudflareRuntime } from './runtime/cloudflare.js';
import { BASE_PATH } from './config.js';

let honoApp;

function getApp(env) {
    if (!honoApp) {
        const runtime = createCloudflareRuntime(env);
        honoApp = createApp(runtime);
    }
    return honoApp;
}

export default {
    async fetch(request, env, ctx) {
        const app = getApp(env);

        const url = new URL(request.url);

        if (
            url.pathname === BASE_PATH ||
            url.pathname.startsWith(`${BASE_PATH}/`)
        ) {
            url.pathname =
                url.pathname.slice(BASE_PATH.length) || '/';
        }

        const rewrittenRequest = new Request(url, request);

        return app.fetch(rewrittenRequest, env, ctx);
    }
};
