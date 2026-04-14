let tableData = [];
let groupedData = {};
let dates = [];
let currentPage = 0;
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

    hosts.forEach(host => {
        const h = entry.hosts[host];
        if (!h) return;

        if (h.status === "down") downCount++;
        else if (h.status === "degraded") degradedCount++;

        if (h.latency_ms != null) {
            totalLatency += h.latency_ms;
            countLatency++;
        }
        if (h.packet_loss != null) {
            totalPacketLoss += h.packet_loss;
            countPacketLoss++;
        }
    });

    let overallStatus;
    if (downCount === hosts.length) {
        overallStatus = "down";
    } else if (downCount > 0 || degradedCount > 0) {
        overallStatus = "degraded";
    } else {
        overallStatus = "up";
    }

    return {
        status: overallStatus,
        latency: countLatency ? Math.round(totalLatency / countLatency) : null,
        packet_loss: countPacketLoss ? Math.round(totalPacketLoss / countPacketLoss) : null
    };
}

function groupByDate(data) {
    groupedData = {};

    data.forEach(entry => {
        const date = entry.timestamp.split(" ")[0];
        if (!groupedData[date]) groupedData[date] = [];
        groupedData[date].push(entry);
    });

    dates = Object.keys(groupedData).sort().reverse();

    if (currentPage >= dates.length) currentPage = 0;
}

async function fetchData() {
    const res = await fetch("/api/status");
    const data = await res.json();

    tableData = data.slice().reverse();

    groupByDate(tableData);

    renderTable();
    renderPagination();
    renderHeatmap(groupedData[dates[currentPage]] || []);
}

function renderTable() {
    const tbody = document.getElementById("logTable");
    tbody.innerHTML = "";

    const hideUp = document.getElementById("hideUp").checked;
    let data = groupedData[dates[currentPage]] || [];

    if (currentSort.col !== null) {
        data.sort((a, b) => {
            let valA, valB;
            const col = currentSort.col;

            if (col === 0) {
                valA = a.timestamp;
                valB = b.timestamp;
            } else if (col === 1) {
                valA = computeOverall(a).status;
                valB = computeOverall(b).status;
            } else if (col >= 2 && col < hosts.length + 2) {
                const host = hosts[col - 2];
                valA = a.hosts[host].status;
                valB = b.hosts[host].status;
            } else {
                valA = a.note || "";
                valB = b.note || "";
            }

            return currentSort.asc
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA);
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

        rowHTML += `
            <td class="${getStatusClass(overall.status)}" data-bs-toggle="tooltip" title="${overallTooltip}">
                <div>${overall.status}</div>
                <div class="text-muted small d-none d-md-block">${overallTooltip}</div>
            </td>
        `;

        hosts.forEach(host => {
            const h = entry.hosts[host];
            if (!h) return;

            let details = [];
            if (h.latency_ms != null) details.push(`${h.latency_ms}ms`);
            if (h.packet_loss != null) details.push(`${h.packet_loss}% lost`);

            let tooltip = details.join(", ");

            rowHTML += `
                <td class="${getStatusClass(h.status)}" data-bs-toggle="tooltip" title="${tooltip}">
                    <div>${h.status}</div>
                    <div class="text-muted small d-none d-md-block">${tooltip}</div>
                </td>
            `;
        });

        rowHTML += `
            <td class="text-muted d-none d-md-table-cell" title="${entry.note || ""}">
                ${entry.note || ""}
            </td>
        `;

        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
        new bootstrap.Tooltip(el);
    });
}

function renderHeatmap(data) {
    const container = document.getElementById("heatmap");
    container.innerHTML = "";

    const maxCells = 720;
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

function renderPagination() {
    const labelTop = document.getElementById("pageLabel");
    const labelBottom = document.getElementById("pageLabelBottom");

    if (!dates.length) {
        if (labelTop) labelTop.textContent = "No data";
        if (labelBottom) labelBottom.textContent = "No data";
        return;
    }

    const text = `Date: ${dates[currentPage]} (${currentPage + 1}/${dates.length})`;

    if (labelTop) labelTop.textContent = text;
    if (labelBottom) labelBottom.textContent = text;

    const prevButtons = [
        document.getElementById("prevPage"),
        document.getElementById("prevPageBottom")
    ];

    const nextButtons = [
        document.getElementById("nextPage"),
        document.getElementById("nextPageBottom")
    ];

    prevButtons.forEach(btn => {
        if (btn) btn.disabled = currentPage >= dates.length - 1;
    });

    nextButtons.forEach(btn => {
        if (btn) btn.disabled = currentPage <= 0;
    });
}

document.querySelectorAll("#statusTable th.sortable").forEach((th, idx) => {
    th.addEventListener("click", () => {
        if (currentSort.col === idx) currentSort.asc = !currentSort.asc;
        else currentSort = { col: idx, asc: true };

        document.querySelectorAll("#statusTable th")
            .forEach(h => h.classList.remove("sorted-asc", "sorted-desc"));

        th.classList.add(currentSort.asc ? "sorted-asc" : "sorted-desc");

        renderTable();
    });
});

document.getElementById("prevPage").addEventListener("click", () => {
    if (currentPage < dates.length - 1) {
        currentPage++;
        renderTable();
        renderPagination();
        renderHeatmap(groupedData[dates[currentPage]] || []);
    }
});

document.getElementById("nextPage").addEventListener("click", () => {
    if (currentPage > 0) {
        currentPage--;
        renderTable();
        renderPagination();
        renderHeatmap(groupedData[dates[currentPage]] || []);
    }
});


document.getElementById("prevPageBottom").addEventListener("click", () => {
    if (currentPage < dates.length - 1) {
        currentPage++;
        renderTable();
        renderPagination();
        renderHeatmap(groupedData[dates[currentPage]] || []);
    }
});

document.getElementById("nextPageBottom").addEventListener("click", () => {
    if (currentPage > 0) {
        currentPage--;
        renderTable();
        renderPagination();
        renderHeatmap(groupedData[dates[currentPage]] || []);
    }
});

document.getElementById("hideUp").addEventListener("change", renderTable);

fetchData();
setInterval(fetchData, 10000);
