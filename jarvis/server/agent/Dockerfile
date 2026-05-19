FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN addgroup --system jarvis && adduser --system --ingroup jarvis --home /home/jarvis_agent jarvis_agent

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY auth.py /app/auth.py
COPY tools.py /app/tools.py
COPY server_agent.py /app/server_agent.py

RUN mkdir -p /srv/jarvis/logs /srv/jarvis/agent_state && chown -R jarvis_agent:jarvis /srv/jarvis /app

USER jarvis_agent

EXPOSE 9000 9001

CMD ["python", "/app/server_agent.py"]
