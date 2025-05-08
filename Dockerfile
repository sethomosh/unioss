# Stage 1: Install dependencies
FROM python:3.11.5-slim AS base
WORKDIR /app

# Create non-root user and log directory together
RUN adduser --system --group appuser \
    && mkdir /app/logs \
    && chown appuser:appuser /app/logs

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Final image
FROM python:3.11.5-slim 
WORKDIR /app

# Recreate same user & logs dir (for safety if not using bind-mount)
RUN adduser --system --group appuser \
    && mkdir /app/logs \
    && chown appuser:appuser /app/logs

USER appuser

# Copy dependencies and code
COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=base /usr/local/bin /usr/local/bin
COPY backend ./backend
COPY wait-for-it.sh /usr/local/bin/

# Expose port, set entrypoint, and healthcheck
EXPOSE 5000
ENTRYPOINT ["/usr/local/bin/wait-for-it.sh", "--timeout=60","db:3306", "--"]
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "backend.app:app"]
HEALTHCHECK --interval=30s CMD curl -f http://localhost:5000 || exit 1