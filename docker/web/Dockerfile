# 前端构建：在 Node 中 build React，再用 Nginx 托管
FROM node:20-alpine AS build
WORKDIR /app

# 复制依赖清单并安装
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码并构建
COPY . .
# 注入构建期变量（docker/.env 中的 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_TRANSLATE_URL）
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_TRANSLATE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_TRANSLATE_URL=$VITE_TRANSLATE_URL
RUN npm run build

# ---- 运行时：Nginx 托管静态文件 + 反代 Supabase ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
