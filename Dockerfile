# jCar - SvelteKit (adapter-node) single-container build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Tesseract OCR for AI Auto Fill (receipt photos are OCR'd locally).
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
# Static assets keep their source file modes; the container runs as 1337, so
# a 660 source file would be unreadable and crash adapter-node's static
# file stream (EACCES). Normalise everything world-readable.
RUN chmod -R a+rX /app/build
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "build"]
