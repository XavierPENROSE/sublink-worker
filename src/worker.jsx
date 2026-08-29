import { createApp } from './app/createApp.jsx';
import { createCloudflareRuntime } from './runtime/cloudflare.js';

const BASE_PATH = '/sublink-worker';

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

        // When accessed through:
        // https://www.primecare.cloudns.org/sublink-worker/*
        // remove the external base path before handing the request
        // to the original Sublink application.
        if (
            url.pathname === BASE_PATH ||
            url.pathname.startsWith(`${BASE_PATH}/`)
        ) {
            url.pathname = url.pathname.slice(BASE_PATH.length) || '/';
        }

        const rewrittenRequest = new Request(url, request);

        return app.fetch(rewrittenRequest, env, ctx);
    }
};
