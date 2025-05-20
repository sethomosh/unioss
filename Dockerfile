# Stage 1: Install dependencies + SNMP tools
FROM python:3.11.5-slim-bullseye AS base
WORKDIR /app

# 1) SNMP CLI so we can debug inside the build stage
RUN apt-get update \
    && apt-get install -y --no-install-recommends snmp curl \
    && rm -rf /var/lib/apt/lists/*

# 2) Create unprivileged user *before* creating logs
RUN adduser --system --group appuser \
    && mkdir -p /app/logs \
    && chown -R appuser:appuser /app/logs \
    && touch /app/logs/backend.log \
    && chown appuser:appuser /app/logs/backend.log

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Final runtime image
FROM python:3.11.5-slim-bullseye
WORKDIR /app

USER root

# Install SNMP CLI tools for debugging
RUN apt-get update \
    && apt-get install -y --no-install-recommends snmp curl \
    && rm -rf /var/lib/apt/lists/*
USER nobody:nogroup

# Recreate user & logs dir with correct ownership
RUN adduser --system --group appuser \
    && mkdir -p /app/logs \
    && chown -R appuser:appuser /app/logs

# ——— NEW: touch the log file and chown it so appuser can rotate it ———
RUN touch /app/logs/backend.log \
    && chown appuser:appuser /app/logs/backend.log

# Switch to unprivileged user
USER appuser

# Copy in dependencies and code
COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=base /usr/local/bin /usr/local/bin
COPY backend ./backend
COPY wait-for-it.sh /usr/local/bin/

# Expose, entrypoint & healthcheck
EXPOSE 5000
ENTRYPOINT ["/usr/local/bin/wait-for-it.sh", "--timeout=60", "db:3306", "--"]
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "backend.app:app"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
    CMD curl -f http://localhost:5000/health || exit 1