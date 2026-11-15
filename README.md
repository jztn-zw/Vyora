# VYORA

The public VYORA website and its API.

Install dependencies at the repository root:

```powershell
npm ci
```

Run the website with `npm run dev:client` and the API with `npm run dev:server` in a separate terminal. The website opens at `http://127.0.0.1:5174`. The API health endpoint is `http://127.0.0.1:8787/api/health`.

```powershell
npm run build:client
npm run build:server
```

Cloudflare Workers serves `apps/client/dist` using `wrangler.jsonc`. Set `VITE_WINDOWS_INSTALLER_URL` in the build environment if an installer download is available. Start the compiled API separately with `npm run start:server`.
