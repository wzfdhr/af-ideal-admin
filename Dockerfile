FROM node:24.17.0-alpine AS builder

WORKDIR /app

ENV HUSKY=0

RUN npm install --global npm@11.13.0

COPY package*.json ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/workflow-core/package.json ./packages/workflow-core/package.json
COPY services/reference-api/package.json ./services/reference-api/package.json
RUN npm ci

COPY . .
RUN npm run build:shared
RUN npm run build:prd

FROM nginx:1.27-alpine

ENV API_PROXY_PASS=http://backend:8080

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
