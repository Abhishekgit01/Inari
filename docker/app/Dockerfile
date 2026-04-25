FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir flask gunicorn

COPY app.py .

ENV FLASK_ENV=production
ENV NODE_ID=0
ENV NODE_LABEL=APP-XX
ENV NODE_ZONE=app_server
ENV SERVICE_NAME=generic-service

EXPOSE 3000

CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--workers", "1", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
