
# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim

# Base : dépendances du monorepo
FROM ${NODE_IMAGE} AS base
WORKDIR /app

COPY package*.json ./
COPY apps/playground/package.json ./apps/playground/
COPY apps/paint/package.json ./apps/paint/
COPY packages/core/package.json ./packages/core/
COPY packages/vision/package.json ./packages/vision/

RUN npm ci

COPY . .

# Développement : Vite + hot-reload
FROM base AS dev
ENV NODE_ENV=development

EXPOSE 3000 3001

# Build : sélection du sous-projet
FROM base AS build
ARG APP=playground

RUN npm run build -w "$APP"

# Production : fichiers statiques
FROM nginx:stable-alpine AS prod
ARG APP=playground

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/${APP}/dist /usr/share/nginx/html

EXPOSE 80
