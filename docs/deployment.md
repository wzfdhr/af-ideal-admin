# Deployment

AF-Ideal-Admin uses Vite and Vue Router history mode.

## Build

```bash
npm ci
npm run build:prd
```

The output directory is `dist`.

## Environment

Production builds read:

- `VITE_APP_ENV`
- `VITE_BASE_URL`
- `VITE_API_BASE_URL`
- `VITE_APP_TITLE`

Use `VITE_BASE_URL` when the app is deployed under a sub-path.

## API Routing

`VITE_API_BASE_URL` is the browser-visible API prefix. For example:

```dotenv
VITE_API_BASE_URL=/api
```

API modules should call resource paths such as `/user/login`; Axios combines
the prefix and resource path into `/api/user/login`.

The Vite proxy is only for local development. In production, configure the
gateway or web server to route `VITE_API_BASE_URL` to the backend service.

## History Fallback

The router uses `createWebHistory()`. The web server must return `index.html`
for unknown front-end routes.

Nginx example:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

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
