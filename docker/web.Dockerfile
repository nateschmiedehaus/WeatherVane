FROM node:20-alpine

WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json* ./apps/web/
RUN cd apps/web \
    && npm install --legacy-peer-deps || npm install

COPY . .

CMD ["npm", "run", "dev", "--prefix", "apps/web"]
