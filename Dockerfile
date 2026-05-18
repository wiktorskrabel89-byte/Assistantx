FROM node:26-bookworm-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --include=optional

# NEXT_PUBLIC_* vars are embedded into client-side bundles at build time.
# These are non-secret public identifiers (publishable/anon keys).
# All other secrets (OPENROUTER_API_KEY, STRIPE_SECRET_KEY, etc.) must be
# provided at container runtime via `docker run -e` or an orchestrator secret
# store — never bake them into the image.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

COPY . .
RUN rm -rf .next && npm run build
RUN cp -r .next/static .next/standalone/.next/static
RUN cp -r public .next/standalone/public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", ".next/standalone/server.js"]
