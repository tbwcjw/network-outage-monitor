FROM python:3.10-slim

RUN apt update && \
    apt install -y iputils-ping && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /tracker
COPY . /tracker
RUN pip install --upgrade pip && pip install -r /tracker/requirements.txt
EXPOSE 5000

CMD ["python", "/tracker/tracker.py"]
