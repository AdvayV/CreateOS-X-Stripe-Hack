FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 PUBLIC_DEMO=true
EXPOSE 4173
CMD ["node","server/cart-server.mjs"]
