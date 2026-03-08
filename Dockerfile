# Stage: builder
FROM python:3.11-slim-bullseye AS builder
WORKDIR /app

# System deps for snmp debug tools and building wheels
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential snmp curl \
    && rm -rf /var/lib/apt/lists/*

# Copy wait-for-it and make executable early
COPY wait-for-it.sh /usr/local/bin/wait-for-it.sh
RUN chmod +x /usr/local/bin/wait-for-it.sh

# Install Python deps into builder stage
COPY requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Stage: runtime
FROM python:3.11-slim-bullseye AS runtime
WORKDIR /app

# Copy wait-for-it and site-packages from builder
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# System tools (snmp/curl) for debugging/checks
RUN apt-get update \
    && apt-get install -y --no-install-recommends snmp curl \
    && rm -rf /var/lib/apt/lists/*

# Create logs dir (permission-friendly)
RUN mkdir -p /app/logs && chmod -R a+rwX /app/logs

# Copy the application packages into the image
COPY backend /app/backend

# Ensure /app is on sys.path
ENV PYTHONPATH=/app:${PYTHONPATH:-}

# Expose port and default command
EXPOSE 5000

ENTRYPOINT ["/usr/local/bin/wait-for-it.sh", "--timeout=60", "db:3306", "--"]
CMD ["gunicorn", "-b", "0.0.0.0:5000", "--workers", "4", "backend.app_flask:app"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
    CMD curl -f http://localhost:5000/health || exit 1
