FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir flask

COPY workstation.py .

ENV NODE_ID=10
ENV NODE_LABEL=WS-XX
ENV NODE_ZONE=workstation
ENV USER=employee

EXPOSE 8080

CMD ["python", "workstation.py"]
