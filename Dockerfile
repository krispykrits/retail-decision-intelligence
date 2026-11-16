FROM node:24-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS backend-build
RUN pip install --no-cache-dir uv==0.13.6
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY backend/src/ ./src/
RUN uv sync --locked --no-dev --no-editable

FROM python:3.12-slim-bookworm
ENV PATH="/app/backend/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RDI_STATIC_DIRECTORY=/app/frontend \
    RDI_CORS_ORIGINS=[]
WORKDIR /app
RUN useradd --uid 10001 --create-home app
COPY --from=backend-build /app/backend/.venv /app/backend/.venv
COPY --from=frontend-build /build/frontend/dist /app/frontend
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "retail_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
