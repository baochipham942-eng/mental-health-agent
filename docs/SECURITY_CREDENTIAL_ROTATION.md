# Security Credential Rotation

This project uses Neon/Postgres + Prisma, not Supabase RLS. Production access is mainly controlled by application auth, API route guards, database connection strings, and provider API keys.

## Immediate Rotation

Rotate these because equivalent secret material was present in local env files or tracked source history:

- Neon/Postgres credentials: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_*`, `PGPASSWORD`
- Vercel OIDC material if copied into local env: `VERCEL_OIDC_TOKEN`
- Auth/session secrets after Google account anomaly: `AUTH_SECRET`, `NEXTAUTH_SECRET`
- Model and speech provider keys: `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `KIMI_API_KEY`, `BAIDU_SPEECH_API_KEY`, `BAIDU_SPEECH_SECRET_KEY`, `VOLCENGINE_API_KEY`
- Observability write credentials: `LANGFUSE_SECRET_KEY`
- Internal job/API secrets: `CRON_SECRET`, `EVAL_API_KEY`

## Keep, But Do Not Treat As Secrets

- `LANGFUSE_PUBLIC_KEY` is public-facing but should still be project-scoped.
- `NEXT_PUBLIC_*` values can be exposed to the browser by design. Do not put private credentials behind that prefix.
- `POSTHOG` browser keys are publishable analytics keys; restrict allowed domains in the provider console.

## Console Steps

1. Neon: create new database role/password, update Vercel Production/Preview/Development env vars, run a read-only smoke, then revoke the old role/password.
2. Vercel: remove copied `VERCEL_OIDC_TOKEN` from local env files. OIDC tokens should be ephemeral runtime material, not stored in `.env`.
3. Auth.js: generate a new `AUTH_SECRET`, set the same value for `NEXTAUTH_SECRET` only if both names are still needed, then redeploy. Existing sessions will be invalidated.
4. Provider consoles: rotate AI/speech/Langfuse keys, update Vercel env vars, then revoke old keys after smoke.
5. Internal secrets: rotate `CRON_SECRET` and set `EVAL_API_KEY`; update any cron callers or internal scripts that call eval routes.

## Local Checks

Run:

```bash
npm run security:audit
git status --short --untracked-files=all
git ls-files | rg '(^|/)\\.env|\\.vercel'
```

Do not paste secret values into terminal output or PR descriptions.
