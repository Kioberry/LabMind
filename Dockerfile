# One container for Cloud Run: the Next.js UI is exported as static files and served by the FastAPI backend,
# so the app has a single URL and no cross-origin calls.

FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV STATIC_EXPORT=1 NEXT_PUBLIC_BACKEND_URL=""
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/out ./web
ENV PYTHONUNBUFFERED=1 DATA_DIR=data PORT=8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
