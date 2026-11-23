FROM public.ecr.aws/docker/library/node:22-bookworm-slim
WORKDIR /app
ENV SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_KEY=test-only SUPABASE_DOMAIN=127.0.0.1 STRIPE_SECRET_KEY=sk_test_fake
COPY . .
RUN npm ci && npm run build
COPY --from=fixtures browse-server.mjs /fixtures/browse-server.mjs
COPY public/apple-touch-icon.png /public/apple-touch-icon.png
USER node
ENV HOST=0.0.0.0 PORT=3010 FIXTURE_HOST=0.0.0.0
CMD ["sh", "-c", "node /fixtures/browse-server.mjs & exec node /app/.output/server/index.mjs"]
