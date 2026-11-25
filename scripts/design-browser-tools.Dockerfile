FROM public.ecr.aws/docker/library/node:22-bookworm-slim
WORKDIR /browser
ENV PLAYWRIGHT_BROWSERS_PATH=/browsers
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npx playwright install --with-deps chromium
COPY scripts/start-design-browser.mjs ./start-design-browser.mjs
USER node
CMD ["node", "/browser/start-design-browser.mjs"]
