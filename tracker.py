from flask import Flask, render_template, jsonify
import subprocess
import datetime
import json
import time
from threading import Thread
import re
import sys
from pathlib import Path

app = Flask(__name__)

hosts = {
    "Microsoft NCSI": "www.msftncsi.com",
    "Google": "google.com",
    "Spectrum": "spectrum.com",
}

log_file = Path("status_log.json")
PING_INTERVAL = 120  # seconds
DEGRADED_LATENCY_MS = 500  # threshold for latency
DEGRADED_PACKET_LOSS = 0   # any > 0% is degraded

if not log_file.exists():
    with open(log_file, "w") as f:
        json.dump([], f)

def ping_host(host):
    try:
        param = "-n" if sys.platform.startswith("win") else "-c"
        count = "4"
        result = subprocess.run(
            ["ping", param, count, host],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        output = result.stdout

        latency = None
        packet_loss = 100
        reachable = False

        if sys.platform.startswith("win"):
            match_loss = re.search(r"Lost = (\d+)", output)
            lost = int(match_loss.group(1)) if match_loss else 4
            packet_loss = (lost / 4) * 100
            match_avg = re.search(r"Average = (\d+)ms", output)
            latency = int(match_avg.group(1)) if match_avg else None
            reachable = packet_loss < 100
        else:
            match_loss = re.search(r"(\d+)% packet loss", output)
            packet_loss = int(match_loss.group(1)) if match_loss else 100
            match_rtt = re.search(r"rtt .* = [\d\.]+/([\d\.]+)/[\d\.]+/[\d\.]+ ms", output)
            latency = int(float(match_rtt.group(1))) if match_rtt else None
            reachable = packet_loss < 100

        if not reachable:
            return {"status": "down", "reason": "Host unreachable", "latency_ms": latency, "packet_loss": packet_loss}
        elif (latency and latency > DEGRADED_LATENCY_MS) or packet_loss > DEGRADED_PACKET_LOSS:
            reason = f"High latency: {latency}ms" if latency and latency > DEGRADED_LATENCY_MS else f"Packet loss: {packet_loss}%"
            return {"status": "degraded", "reason": reason, "latency_ms": latency, "packet_loss": packet_loss}
        else:
            return {"status": "up", "reason": "", "latency_ms": latency, "packet_loss": packet_loss}
    except Exception as e:
        return {"status": "down", "reason": str(e), "latency_ms": None, "packet_loss": 100}

last_ping = None
def monitor_loop():
    global last_ping

    while True:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        last_ping = timestamp

        hosts_status = {}
        notes = []

        # Ping each host
        for name, host in hosts.items():
            info = ping_host(host)
            hosts_status[name] = info
            if info["status"] != "up":
                notes.append(f"{name}: {info['reason']}")

        statuses = [h["status"] for h in hosts_status.values()]
        if all(s == "up" for s in statuses):
            overall = "up"
        elif all(s == "down" for s in statuses):
            overall = "down"
        else:
            overall = "degraded"

        entry = {
            "timestamp": timestamp,
            "overall_status": overall,
            "hosts": hosts_status,
            "note": "; ".join(notes)
        }

        try:
            if log_file.exists():
                with open(log_file) as f:
                    log = json.load(f)
            else:
                log = []
            log.append(entry)
            with open(log_file, "w") as f:
                json.dump(log, f, indent=2)
        except Exception as e:
            print(f"Error writing log: {e}")

        time.sleep(PING_INTERVAL)

@app.route("/")
def index():
    return render_template("index.html", hosts=list(hosts.keys()), last_update=last_ping, update_ival=PING_INTERVAL)

@app.route("/api/status")
def api_status():
    if log_file.exists():
        with open(log_file) as f:
            data = json.load(f)
        return jsonify(data)
    return jsonify([])

if __name__ == "__main__":
    t = Thread(target=monitor_loop, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5000, debug=False)
