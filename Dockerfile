# Stage 1: builder
FROM python:3.11.5-slim-bullseye AS builder
WORKDIR /app

# 1) SNMP CLI tools for debugging
RUN apt-get update \
    && apt-get install -y --no-install-recommends snmp curl \
    && rm -rf /var/lib/apt/lists/*

# 2) Create unprivileged user & logs
RUN adduser --system --group appuser \
    && mkdir -p /app/logs \
    && chown -R appuser:appuser /app/logs \
    && touch /app/logs/backend.log \
    && chown appuser:appuser /app/logs/backend.log

# Copy wait-for-it and make executable
COPY wait-for-it.sh /usr/local/bin/wait-for-it.sh
RUN chmod +x /usr/local/bin/wait-for-it.sh

# Install Python deps (including gunicorn)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# Stage 2: runtime
FROM python:3.11.5-slim-bullseye AS runtime
WORKDIR /app

USER root

# 1) Copy all pip scripts + wait-for-it from builder
COPY --from=builder /usr/local/bin /usr/local/bin

# 2) Copy Python libs
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# 3) Install snmp tools again
RUN apt-get update \
    && apt-get install -y --no-install-recommends snmp curl \
    && rm -rf /var/lib/apt/lists/*

# 4) Re-create unprivileged user & logs dir
RUN adduser --system --group appuser \
    && mkdir -p /app/logs \
    && chmod -R a+rwX /app/logs

# Drop to unprivileged
USER appuser

# Copy application code
COPY backend ./backend

# Port, entrypoint & CMD
EXPOSE 5000
ENTRYPOINT ["/usr/local/bin/wait-for-it.sh", "--timeout=60", "db:3306", "--"]
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "backend.app:app"]

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
    CMD curl -f http://localhost:5000/health || exit 1
