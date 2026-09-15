/**
 * reports.js — Controller for reports.html
 * Visualizes TAT distribution, product breakdowns, and allows full Excel export.
 */

var reportState = {
  columns: [],
  data: []
};

document.addEventListener('DOMContentLoaded', function() {
  loadReportData();
});

function loadReportData() {
  var stored = null;
  try {
    var raw = localStorage.getItem('gspn_extracted_data');
    if (raw) stored = JSON.parse(raw);
  } catch (e) {
    console.error('[Reports] Failed to parse localStorage data:', e);
  }

  if (stored && stored.data && stored.data.length > 0) {
    reportState.columns = stored.columns || [];
    reportState.data = stored.data;
    renderReports();
  } else {
    showNoDataState();
  }
}

function showNoDataState() {
  var noData = document.getElementById('reportNoData');
  var content = document.getElementById('reportContent');
  if (noData) {
    noData.classList.remove('hidden');
    // Add demo data button if not already present
    if (!document.getElementById('btnLoadDemoReport')) {
      var p = noData.querySelector('p');
      if (p) {
        var btn = document.createElement('div');
        btn.style.marginTop = '16px';
        btn.innerHTML = '<button id="btnLoadDemoReport" class="btn-primary" style="margin: 0 auto; display: inline-flex; font-size: 13px; padding: 8px 16px;">Load Sample Report Data</button>';
        p.parentNode.appendChild(btn);
        document.getElementById('btnLoadDemoReport').addEventListener('click', loadDemoData);
      }
    }
  }
  if (content) content.classList.add('hidden');
}

function loadDemoData() {
  var sampleML = `No\tService Order No.\tASC Job No\tCreated\tAssigned\tAssigned Time\tModel\tSerial\tWty Status\tVOC\tREDO\tRisk Sensing\tRED\tHigh Priority
Customer Name\tCity\tApp Date\tApp Time\tService Type\tStatus\tReason\tB2B\tRisk Reason
1\t 4441809308  Edit\t4441809308\t09.04.2026\t09.04.2026\t17:58:10\tWT70M3000UU/TL\tM000\tOut of Warranty\t\tN\t\tN\tN
SUMIT KUMAR\tGURGAON\t09.05.2026\t13:00:00\tIN-HOME\tEngineer Assigned\tRepair in progress\t\t
2\t 4441809490  Edit\t4441809490\t09.04.2026\t09.04.2026\t09:18:47\tWT1007AG/TL\tM000\tOut of Warranty\t\tN\t\tN\tN
RAJIV SHARMA .\tGURGAON\t09.05.2026\t12:00:00\tIN-HOME\tEngineer Assigned\tRepair in progress\t\t
3\t 4441811026  Edit\t4441811026\t09.04.2026\t09.04.2026\t09:50:20\tRT47H567ESL/TL\tM000\tOut of Warranty\t\tN\t\tN\tN
MANJU KHANNA\tGURGAON\t09.05.2026\t12:00:00\tIN-HOME\tEngineer Assigned\tRepair in progress\t\t
4\t 4441813170  Edit\t4441813170\t09.04.2026\t09.04.2026\t10:28:36\tWA80F08S2CTL\tM000\tOut of Warranty\t\tN\t\tN\tN
Pankaj Ahlawat\tGURGAON\t09.05.2026\t12:00:00\tIN-HOME\tEngineer Assigned\tRepair in progress\t\t
5\t 4441814470  Edit\t4441814470\t09.04.2026\t09.04.2026\t10:47:23\tAR18CY3AAGBNNA\tM000\tIn Warranty\t\tN\t\tN\tN
Mukul Garg\tDELHI\t09.05.2026\t15:00:00\tCustomer Care\tEngineer Assigned\tRepair in progress`;

  if (typeof parseManagementLiteText === 'function') {
    var parsed = parseManagementLiteText(sampleML);
    reportState.columns = parsed.columns;
    reportState.data = parsed.data;
    try {
      localStorage.setItem('gspn_extracted_data', JSON.stringify({
        columns: parsed.columns,
        data: parsed.data,
        source: 'Sample Data',
        timestamp: new Date().toISOString()
      }));
    } catch(e) {}
    renderReports();
  }
}

function renderReports() {
  var data = reportState.data;
  var columns = reportState.columns;
  if (!data || data.length === 0) {
    showNoDataState();
    return;
  }

  var noData = document.getElementById('reportNoData');
  var content = document.getElementById('reportContent');
  if (noData) noData.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  renderSummaryStats(data);
  renderTatBars(data);
  renderProductGrid(data);
  renderAllRecordsTable(columns, data);
}

function renderSummaryStats(data) {
  var total = data.length;
  var inWty = 0, outWty = 0;
  var totalTat = 0, countTat = 0;

  for (var i = 0; i < data.length; i++) {
    var w = (data[i]['Wty Status'] || '').toLowerCase();
    if (w.indexOf('in warranty') !== -1 || w.indexOf('in_warranty') !== -1) {
      inWty++;
    } else {
      outWty++;
    }

    var created = data[i]['Created'] || data[i]['ASC Assigned'] || '';
    if (created) {
      var tat = calcTAT(created);
      if (typeof tat === 'number') {
        totalTat += tat;
        countTat++;
      }
    }
  }

  var avgTat = countTat > 0 ? (totalTat / countTat).toFixed(1) + 'd' : 'N/A';
  var inWtyPct = total > 0 ? Math.round((inWty / total) * 100) : 0;
  var outWtyPct = total > 0 ? Math.round((outWty / total) * 100) : 0;

  var container = document.getElementById('summaryStats');
  if (!container) return;

  container.innerHTML =
    '<div class="report-stat-card">' +
      '<div class="stat-value" style="color:var(--primary);">' + total + '</div>' +
      '<div class="stat-label">Total Calls</div>' +
    '</div>' +
    '<div class="report-stat-card">' +
      '<div class="stat-value" style="color:var(--accent-green);">' + inWty + ' <span style="font-size:16px; font-weight:600; color:var(--text-muted);">(' + inWtyPct + '%)</span></div>' +
      '<div class="stat-label">In Warranty</div>' +
    '</div>' +
    '<div class="report-stat-card">' +
      '<div class="stat-value" style="color:var(--accent-red);">' + outWty + ' <span style="font-size:16px; font-weight:600; color:var(--text-muted);">(' + outWtyPct + '%)</span></div>' +
      '<div class="stat-label">Out of Warranty</div>' +
    '</div>' +
    '<div class="report-stat-card">' +
      '<div class="stat-value" style="color:#d97706;">' + avgTat + '</div>' +
      '<div class="stat-label">Average TAT</div>' +
    '</div>';
}

function renderTatBars(data) {
  var buckets = {
    '0–2 Days': 0,
    '3–7 Days': 0,
    '8–10 Days': 0,
    '11–14 Days': 0,
    '15–30 Days': 0,
    '>30 Days': 0
  };
  var colors = {
    '0–2 Days': '#10b981',
    '3–7 Days': '#3b82f6',
    '8–10 Days': '#f59e0b',
    '11–14 Days': '#f97316',
    '15–30 Days': '#ef4444',
    '>30 Days': '#991b1b'
  };

  for (var i = 0; i < data.length; i++) {
    var agingVal = data[i]['Aging'];
    var tat;
    if (agingVal !== undefined && agingVal !== null && agingVal !== '') {
      tat = parseFloat(agingVal);
    } else {
      var created = data[i]['Created'] || data[i]['Assigned'] || data[i]['ASC Assigned'] || '';
      tat = calcTAT(created);
    }
    if (typeof tat !== 'number' || isNaN(tat)) tat = 0;

    if (tat <= 2) buckets['0–2 Days']++;
    else if (tat <= 7) buckets['3–7 Days']++;
    else if (tat <= 10) buckets['8–10 Days']++;
    else if (tat <= 14) buckets['11–14 Days']++;
    else if (tat <= 30) buckets['15–30 Days']++;
    else buckets['>30 Days']++;
  }

  var total = data.length;
  var container = document.getElementById('tatBars');
  if (!container) return;

  var html = '';
  for (var k in buckets) {
    var count = buckets[k];
    var pct = total > 0 ? Math.round((count / total) * 100) : 0;
    var fillWidth = Math.max(pct, count > 0 ? 8 : 0);

    html += '<div class="tat-bar-row">' +
      '<div class="tat-bar-label">' + k + '</div>' +
      '<div class="tat-bar-track">' +
        '<div class="tat-bar-fill" style="width:' + fillWidth + '%; background:' + colors[k] + ';">' +
          (count > 0 ? pct + '%' : '') +
        '</div>' +
      '</div>' +
      '<div class="tat-bar-count">' + count + '</div>' +
    '</div>';
  }

  container.innerHTML = html;
}

function renderProductGrid(data) {
  var counts = {};
  var total = data.length;

  for (var i = 0; i < data.length; i++) {
    var prod = data[i]['Product'] || 'OTHER';
    counts[prod] = (counts[prod] || 0) + 1;
  }

  var sorted = Object.keys(counts).sort(function(a, b) {
    return counts[b] - counts[a];
  });

  var container = document.getElementById('productGrid');
  if (!container) return;

  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    var p = sorted[i];
    var c = counts[p];
    var pct = total > 0 ? Math.round((c / total) * 100) : 0;

    html += '<div class="product-card">' +
      '<div class="product-name">' + escapeHtml(p) + '</div>' +
      '<div class="product-count">' + c + '</div>' +
      '<div class="product-pct">' + pct + '% of total</div>' +
    '</div>';
  }

  container.innerHTML = html;
}

function renderAllRecordsTable(columns, data) {
  var thead = document.getElementById('allRecordsHead');
  var tbody = document.getElementById('allRecordsBody');
  var info = document.getElementById('allRecordsInfo');
  if (!thead || !tbody) return;

  var displayCols = columns.length > 0 ? columns : Object.keys(data[0] || {});

  var hHtml = '<tr>';
  for (var c = 0; c < displayCols.length; c++) {
    hHtml += '<th>' + escapeHtml(displayCols[c]) + '</th>';
  }
  hHtml += '</tr>';
  thead.innerHTML = hHtml;

  var bHtml = '';
  for (var r = 0; r < data.length; r++) {
    bHtml += '<tr>';
    for (var c = 0; c < displayCols.length; c++) {
      bHtml += '<td>' + escapeHtml(data[r][displayCols[c]] || '') + '</td>';
    }
    bHtml += '</tr>';
  }
  tbody.innerHTML = bHtml;

  if (info) {
    info.textContent = 'Showing all ' + data.length + ' records · ' + displayCols.length + ' columns';
  }
}

function exportReportExcel() {
  if (!reportState.data || reportState.data.length === 0) {
    if (typeof showToast === 'function') showToast('No data to export', 'error');
    return;
  }
  if (typeof downloadExcel === 'function') {
    downloadExcel(reportState.columns, reportState.data, 'GSPN_Report');
    if (typeof showToast === 'function') showToast('Report Excel downloaded!', 'success');
  }
}
