let tableData = [];
let currentSort = { col: null, asc: true };

function getStatusClass(status) {
    if (status === "up") return "table-success";
    if (status === "degraded") return "table-warning";
    if (status === "down") return "table-danger";
    return "";
}

function computeOverall(entry) {
    let totalLatency = 0;
    let totalPacketLoss = 0;
    let countLatency = 0;
    let countPacketLoss = 0;

    let downCount = 0;
    let degradedCount = 0;
    let upCount = 0;

    hosts.forEach(host => {
        const h = entry.hosts[host];
        if (!h) return;

        if (h.status === "down") downCount++;
        else if (h.status === "degraded") degradedCount++;
        else if (h.status === "up") upCount++;

        if (h.latency_ms != null) { totalLatency += h.latency_ms; countLatency++; }
        if (h.packet_loss != null) { totalPacketLoss += h.packet_loss; countPacketLoss++; }
    });

    let overallStatus;
    if (downCount === hosts.length) overallStatus = "down";
    else if (degradedCount > 0) overallStatus = "degraded";
    else overallStatus = "up";

    const avgLatency = countLatency ? Math.round(totalLatency / countLatency) : null;
    const avgPacketLoss = countPacketLoss ? Math.round(totalPacketLoss / countPacketLoss) : null;

    return {
        status: overallStatus,
        latency: avgLatency,
        packet_loss: avgPacketLoss
    };
}

async function fetchData() {
    const res = await fetch("/api/status");
    const data = await res.json();
    tableData = data.slice().reverse(); //lastest
    renderTable();
    renderHeatmap(data);
}

function renderTable() {
    const tbody = document.getElementById("logTable");
    tbody.innerHTML = "";
    const hideUp = document.getElementById("hideUp").checked;

    let data = tableData.slice();

    if (currentSort.col !== null) {
        data.sort((a, b) => {
            let valA, valB;
            const col = currentSort.col;

            if (col === 0) { valA = a.timestamp; valB = b.timestamp; }
            else if (col === 1) {
                valA = computeOverall(a).status;
                valB = computeOverall(b).status;
            }
            else if (col >= 2 && col < hosts.length + 2) {
                const host = hosts[col - 2];
                valA = a.hosts[host].status;
                valB = b.hosts[host].status;
            } else { valA = a.note || ""; valB = b.note || ""; }

            if (valA < valB) return currentSort.asc ? -1 : 1;
            if (valA > valB) return currentSort.asc ? 1 : -1;
            return 0;
        });
    }

    data.forEach(entry => {
        const overall = computeOverall(entry);
        if (hideUp && overall.status === "up") return;

        const tr = document.createElement("tr");

        let rowHTML = `<td class="text-muted small">${entry.timestamp}</td>`;

        let overallDetails = [];
        if (overall.latency != null) overallDetails.push(`${overall.latency}ms`);
        if (overall.packet_loss != null) overallDetails.push(`${overall.packet_loss}% lost`);
        let overallTooltip = overallDetails.join(", ");

        rowHTML += `<td class="${getStatusClass(overall.status)}" data-bs-toggle="tooltip" title="${overallTooltip} (average)">
                  <div>${overall.status} </div>
                  <div class="text-muted small d-none d-md-block">${overallTooltip}</div>
                </td>`;

        hosts.forEach(host => {
            const h = entry.hosts[host];
            if (!h) return;

            let details = [];
            if (h.latency_ms != null) details.push(`${h.latency_ms}ms`);
            if (h.packet_loss != null) details.push(`${h.packet_loss}% lost`);
            let tooltip = details.join(", ");

            rowHTML += `<td class="${getStatusClass(h.status)}" data-bs-toggle="tooltip" title="${tooltip}">
                    <div>${h.status}</div>
                    <div class="text-muted small d-none d-md-block">${tooltip}</div>
                  </td>`;
        });

        rowHTML += `<td class="text-muted d-none d-md-table-cell" data-bs-toggle="tooltip" title="${entry.note || null}">${entry.note || ""}</td>`;

        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);
    });

    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (el) { return new bootstrap.Tooltip(el) });
}

function renderHeatmap(data) {
    const container = document.getElementById("heatmap");
    container.innerHTML = "";
    const maxCells = 200;
    const recent = data.slice(-maxCells);

    recent.forEach(entry => {
        const overall = computeOverall(entry);
        const div = document.createElement("div");
        div.classList.add("heat-cell");
        if (overall.status === "up") div.classList.add("heat-up");
        else if (overall.status === "degraded") div.classList.add("heat-degraded");
        else if (overall.status === "down") div.classList.add("heat-down");
        div.title = `${entry.timestamp} - ${overall.status}`;
        container.appendChild(div);
    });
}

document.querySelectorAll("#statusTable th.sortable").forEach((th, idx) => {
    th.addEventListener("click", () => {
        if (currentSort.col === idx) currentSort.asc = !currentSort.asc;
        else currentSort = { col: idx, asc: true };

        document.querySelectorAll("#statusTable th").forEach(h => h.classList.remove("sorted-asc", "sorted-desc"));
        th.classList.add(currentSort.asc ? "sorted-asc" : "sorted-desc");

        renderTable();
    });
});

document.getElementById("hideUp").addEventListener("change", renderTable);

fetchData();
setInterval(fetchData, 10000);