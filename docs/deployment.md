# Deployment

AF-Ideal-Admin uses Vite and Vue Router history mode.

## Build

```bash
npm ci
npm run build:prd
```

The output directory is `dist`.

## Environment

Production builds read build-time env values first:

- `VITE_APP_ENV`
- `VITE_BASE_URL`
- `VITE_API_BASE_URL`
- `VITE_APP_TITLE`

Use `VITE_BASE_URL` when the app is deployed under a sub-path.

Runtime overrides are read from `public/runtime-config.js`, which is copied to
`dist/runtime-config.js` during build and loaded before the app bundle:

```js
window.AF_IDEAL_ADMIN_CONFIG = {
  API_BASE_URL: '/api',
  APP_TITLE: 'AF-Ideal-Admin',
}
```

Runtime config has priority over build-time env values. This lets operations
change API gateway prefixes or the displayed app title without rebuilding the
front-end assets. The committed default file keeps values blank so local and CI
builds continue to use Vite env fallbacks.

## API Routing

`VITE_API_BASE_URL` is the browser-visible API prefix. For example:

```dotenv
VITE_API_BASE_URL=/api
```

API modules should call resource paths such as `/user/login`; Axios combines
the prefix and resource path into `/api/user/login`.

The Vite proxy is only for local development. In production, configure the
gateway or web server to route the browser-visible API prefix, usually `/api`,
to the backend service.

The repository ships an Nginx template at `deploy/nginx/default.conf`:

```nginx
location /api/ {
  proxy_pass http://backend:8080/;
}
```

Adjust `http://backend:8080/` to the real backend upstream. Keep the browser
prefix and `API_BASE_URL` aligned.

## History Fallback

The router uses `createWebHistory()`. The web server must return `index.html`
for unknown front-end routes.

Nginx example:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

`deploy/nginx/default.conf` also disables caching for `runtime-config.js`:

```nginx
location = /runtime-config.js {
  add_header Cache-Control "no-store";
  try_files $uri =404;
}
```

This allows replacing runtime config during deployment without waiting for
browser cache expiry.

## Static Container

The root `Dockerfile` builds the Vite app and serves `dist` with Nginx:

```bash
docker build -t af-ideal-admin:local .
docker run --rm -p 8080:80 af-ideal-admin:local
```

After startup, verify:

- `http://127.0.0.1:8080/` returns the app.
- `http://127.0.0.1:8080/visualization/reportCenter` returns `index.html`.
- `http://127.0.0.1:8080/runtime-config.js` has `Cache-Control: no-store`.
- `/api/*` is forwarded by Nginx, not by Vite dev proxy.

To change runtime config in container deployments, mount or replace
`/usr/share/nginx/html/runtime-config.js`.

## Local Verification

Run the same checks as CI before publishing:

```bash
npm ci
npm run lint:check
npm run typecheck
npm run test
npm run build:prd
npm run test:e2e
```

`npm run test:e2e` expects a fresh `dist` directory. Run `npm run build:prd`
first when testing locally.
