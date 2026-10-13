# Deployment

Recommended free/cheap setup: **MongoDB Atlas** (database) + **Cloudflare R2** (encrypted chunks) + **Render or Railway** (API) + **Vercel** (front end).

## 1. MongoDB Atlas
1. Create a free M0 cluster (it's a replica set — required by Prisma).
2. Database Access → add a user with a strong password. Network Access → allow your API host (or `0.0.0.0/0` with a strong password).
3. Copy the URI and add a database name: `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/securevault?retryWrites=true&w=majority`.
4. Create indexes once: `cd server && DATABASE_URL="<uri>" npx prisma db push`.

## 2. Cloudflare R2 (or AWS S3)
1. Create a bucket, e.g. `securevault-chunks` (keep it **private**).
2. Create an API token with Object Read & Write for that bucket → Access Key ID + Secret.
3. Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`.
4. **CORS** on the bucket (browser uploads directly via pre-signed URLs):
```json
[{ "AllowedOrigins": ["https://your-app.vercel.app"], "AllowedMethods": ["GET", "PUT"],
   "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```
For AWS S3 use the same CORS, omit `S3_ENDPOINT`, and set `S3_REGION` (e.g. `eu-central-1`).

## 3. API on Render / Railway
- Root directory: `server` · Build: `npm ci` (runs `prisma generate`) · Start: `npm start` · Node 20.
- Environment:
```
NODE_ENV=production
DATABASE_URL=mongodb+srv://…/securevault
CLIENT_ORIGIN=https://your-app.vercel.app
JWT_SECRET=<64 random hex>
SERVER_ENC_KEY=<64 random hex>
STORAGE_DRIVER=s3
S3_BUCKET=securevault-chunks
S3_REGION=auto
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```
Generate secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
`app.set('trust proxy', 1)` is already set so rate limits see real client IPs.

## 4. Front end on Vercel
The client calls the API at the relative path `/api/v1`, so put both on **one origin** by rewriting `/api` to the API. This keeps the refresh cookie first-party and `SameSite=Strict`.

`client/vercel.json`:
```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://your-api.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [{ "source": "/(.*)", "headers": [
    { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; frame-src blob:; connect-src 'self' https://*.r2.cloudflarestorage.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" },
    { "key": "Referrer-Policy", "value": "no-referrer" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
  ]}]
}
```
Vercel settings: root `client`, build `npm run build`, output `dist`.
`'wasm-unsafe-eval'` is needed for Argon2id (WebAssembly). `Referrer-Policy: no-referrer` keeps share URLs out of referrers (the `#k=` fragment is never sent anyway).

## 5. Seed (optional)
`API_URL=https://your-app.vercel.app npm run seed` (from `server/`) creates the demo account — skip in real production.

## 6. Checklist
- [ ] HTTPS everywhere (automatic on Vercel/Render/Railway)
- [ ] `NODE_ENV=production` (secure cookies, HSTS, required secrets)
- [ ] Unique `JWT_SECRET` and `SERVER_ENC_KEY` (rotating `SERVER_ENC_KEY` invalidates stored TOTP secrets)
- [ ] Private bucket with CORS limited to your domain
- [ ] Atlas IP allow-list & backups enabled
- [ ] `npm audit` clean, uptime monitor on `/api/v1/health`
- [ ] For several API instances, move rate limiting to Redis (`rate-limit-redis`)
