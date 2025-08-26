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
# Make sure the top-level `app/` package (FastAPI) is present,
# and keep backend/ if you still have helpers there.
COPY app /app/app
COPY backend /app/backend

# Ensure /app is on sys.path (WORKDIR is /app so imports of 'app' work)
ENV PYTHONPATH=/app:${PYTHONPATH:-}

# Expose port and default command (uvicorn)
EXPOSE 5000

ENTRYPOINT ["/usr/local/bin/wait-for-it.sh", "--timeout=60", "db:3306", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "4"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s \
    CMD curl -f http://localhost:5000/health || exit 1
