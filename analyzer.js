/* ============================================================
   Open Pending Analyzer — Dashboard Logic
   File Parsing · Chart Rendering · Data Table · Theme
   ============================================================ */

// ---- Chart Color Palette ----
const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
  '#a78bfa', '#22d3ee', '#fb923c', '#4ade80', '#f43f5e',
  '#38bdf8', '#c084fc', '#fbbf24', '#34d399', '#e879f9'
];

const CHART_COLORS_ALPHA = CHART_COLORS.map(c => c + '22');

// ---- DOM Elements ----
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const btnBrowse = document.getElementById('btnBrowse');
const dashboard = document.getElementById('dashboard');
const loadAnotherBar = document.getElementById('loadAnotherBar');
const btnLoadAnother = document.getElementById('btnLoadAnother');
const btnExportExcel = document.getElementById('btnExportExcel');
const loadedFileName = document.getElementById('loadedFileName');
const loadedFileMeta = document.getElementById('loadedFileMeta');
const fileBadge = document.getElementById('fileBadge');
const fileBadgeText = document.getElementById('fileBadgeText');
const themeToggle = document.getElementById('themeToggle');
const loadingOverlay = document.getElementById('loadingOverlay');

// Table elements
const tableSearch = document.getElementById('tableSearch');
const filterProduct = document.getElementById('filterProduct');
const filterStatus = document.getElementById('filterStatus');
const filterEngineer = document.getElementById('filterEngineer');
const tableCount = document.getElementById('tableCount');
const dataTableHead = document.getElementById('dataTableHead');
const dataTableBody = document.getElementById('dataTableBody');
const paginationInfo = document.getElementById('paginationInfo');
const paginationControls = document.getElementById('paginationControls');

// ---- State ----
let parsedData = [];
let filteredData = [];
let currentPage = 1;
const PAGE_SIZE = 25;
let sortColumn = null;
let sortDirection = 'asc';
let chartInstances = {};

// Columns to display in table
const TABLE_COLUMNS = [
  'S.No', 'Service Order No', 'Model Name', 'Product', 'Engineer',
  'Service Type', 'Short ASC Assigned Date', 'Aging',
  'Status (GSPN)', 'Reason (GSPN)', 'App Date', 'App Time',
  'Wty Status', 'REDO', 'Service Type (Status)'
];

// ---- Theme ----
function initTheme() {
  const saved = localStorage.getItem('analyzer-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('analyzer-theme', next);
  // Re-render charts with new theme colors
  if (parsedData.length > 0) {
    renderAllCharts();
  }
});

initTheme();

// ---- File Upload ----
btnBrowse.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) processFile(file);
  fileInput.value = '';
});

btnLoadAnother.addEventListener('click', () => {
  resetDashboard();
});

btnExportExcel.addEventListener('click', () => {
  exportToExcel();
});

// ---- File Processing ----
function processFile(file) {
  loadingOverlay.classList.add('active');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const html = e.target.result;
      parsedData = parseHTMTable(html);

      if (parsedData.length === 0) {
        alert('No data rows found in the uploaded file. Please check the file format.');
        loadingOverlay.classList.remove('active');
        return;
      }

      // Show dashboard
      uploadZone.classList.add('hidden-zone');
      dashboard.classList.add('visible');
      loadAnotherBar.classList.add('visible');
      fileBadge.classList.add('visible');

      // File info
      loadedFileName.textContent = file.name;
      loadedFileMeta.textContent = `${parsedData.length} records · ${(file.size / 1024).toFixed(1)} KB`;
      fileBadgeText.textContent = `${parsedData.length} records loaded`;

      // Render everything
      computeKPIs();
      populateFilters();
      applyFilters();
      renderAllCharts();

    } catch (err) {
      console.error('Parse error:', err);
      alert('Failed to parse file: ' + err.message);
    } finally {
      loadingOverlay.classList.remove('active');
    }
  };

  reader.onerror = () => {
    loadingOverlay.classList.remove('active');
    alert('Error reading file.');
  };

  reader.readAsText(file, 'utf-8');
}

// ---- HTML Table Parser ----
function parseHTMTable(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');
  let dataTable = null;

  // Find the data table (the one with "Service Order No" in header)
  for (const t of tables) {
    const text = t.textContent || '';
    if (text.includes('Service Order No') || text.includes('Model Name')) {
      dataTable = t;
      break;
    }
  }

  if (!dataTable) {
    // Fallback: use largest table
    let maxRows = 0;
    for (const t of tables) {
      const rows = t.querySelectorAll('tr').length;
      if (rows > maxRows) { maxRows = rows; dataTable = t; }
    }
  }

  if (!dataTable) return [];

  const rows = Array.from(dataTable.querySelectorAll('tr'));
  if (rows.length < 2) return [];

  // Extract headers from first row
  const headerCells = Array.from(rows[0].querySelectorAll('td, th'));
  const headers = headerCells.map(cell => cleanCellText(cell));

  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = Array.from(rows[i].querySelectorAll('td, th'));
    if (cells.length < 3) continue;

    const record = {};
    for (let j = 0; j < headers.length && j < cells.length; j++) {
      record[headers[j]] = cleanCellText(cells[j]);
    }

    // Skip empty rows
    const so = record['Service Order No'] || '';
    if (!so || so.length < 3) continue;

    // Parse aging as number
    if (record['Aging']) {
      record['Aging'] = parseInt(record['Aging'], 10) || 0;
    }

    records.push(record);
  }

  return records;
}

function cleanCellText(cell) {
  if (!cell) return '';
  return (cell.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- KPI Computation ----
function computeKPIs() {
  const total = parsedData.length;
  document.getElementById('kpiTotal').textContent = total;

  // Avg Aging
  const agingValues = parsedData.map(r => parseInt(r['Aging'], 10) || 0);
  const avgAging = agingValues.length > 0 ? (agingValues.reduce((a, b) => a + b, 0) / agingValues.length) : 0;
  document.getElementById('kpiAvgAging').textContent = avgAging.toFixed(1);

  const maxAging = Math.max(...agingValues, 0);
  document.getElementById('kpiAgingSub').textContent = `Max: ${maxAging} days`;

  // Overdue (>3 days)
  const overdue = agingValues.filter(a => a > 3).length;
  document.getElementById('kpiOverdue').textContent = overdue;
  document.getElementById('kpiOverdueSub').innerHTML = `<span class="kpi-badge down">${total > 0 ? ((overdue / total) * 100).toFixed(0) : 0}%</span> of total`;

  // REDO
  const redoCount = parsedData.filter(r => (r['REDO'] || '').toUpperCase() === 'Y').length;
  document.getElementById('kpiRedo').textContent = redoCount;
  document.getElementById('kpiRedoSub').innerHTML = `<span class="kpi-badge ${redoCount > 0 ? 'down' : 'up'}">${total > 0 ? ((redoCount / total) * 100).toFixed(1) : 0}%</span> redo rate`;

  // Warranty
  const inWarranty = parsedData.filter(r => (r['Wty Status'] || '').toLowerCase().includes('in warranty')).length;
  const pct = total > 0 ? ((inWarranty / total) * 100).toFixed(0) : 0;
  document.getElementById('kpiWarranty').textContent = pct + '%';
  document.getElementById('kpiWarrantySub').textContent = `${inWarranty} in-warranty / ${total - inWarranty} out`;

  // Engineers
  const engineers = new Set(parsedData.map(r => (r['Engineer'] || '').trim()).filter(Boolean));
  document.getElementById('kpiEngineers').textContent = engineers.size;
}

// ---- Filters ----
function populateFilters() {
  const products = [...new Set(parsedData.map(r => r['Product'] || '').filter(Boolean))].sort();
  const statuses = [...new Set(parsedData.map(r => r['Status (GSPN)'] || '').filter(Boolean))].sort();
  const engineers = [...new Set(parsedData.map(r => (r['Engineer'] || '').trim()).filter(Boolean))].sort();

  populateSelect(filterProduct, products, 'All Products');
  populateSelect(filterStatus, statuses, 'All Status');
  populateSelect(filterEngineer, engineers, 'All Engineers');
}

function populateSelect(select, options, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt;
    el.textContent = opt;
    select.appendChild(el);
  }
}

function applyFilters() {
  const searchTerm = (tableSearch.value || '').toLowerCase();
  const productFilter = filterProduct.value;
  const statusFilter = filterStatus.value;
  const engineerFilter = filterEngineer.value;

  filteredData = parsedData.filter(record => {
    if (productFilter && record['Product'] !== productFilter) return false;
    if (statusFilter && record['Status (GSPN)'] !== statusFilter) return false;
    if (engineerFilter && (record['Engineer'] || '').trim() !== engineerFilter) return false;
    if (searchTerm) {
      const values = Object.values(record).join(' ').toLowerCase();
      if (!values.includes(searchTerm)) return false;
    }
    return true;
  });

  // Sort
  if (sortColumn !== null) {
    filteredData.sort((a, b) => {
      let va = a[sortColumn] ?? '';
      let vb = b[sortColumn] ?? '';

      // Numeric sort for aging
      if (sortColumn === 'Aging' || sortColumn === 'S.No') {
        va = parseFloat(va) || 0;
        vb = parseFloat(vb) || 0;
      } else {
        va = va.toString().toLowerCase();
        vb = vb.toString().toLowerCase();
      }

      if (va < vb) return sortDirection === 'asc' ? -1 : 1;
      if (va > vb) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  currentPage = 1;
  tableCount.textContent = filteredData.length;
  renderTable();
}

// Bind filter events
tableSearch.addEventListener('input', applyFilters);
filterProduct.addEventListener('change', applyFilters);
filterStatus.addEventListener('change', applyFilters);
filterEngineer.addEventListener('change', applyFilters);

// ---- Table Rendering ----
function renderTable() {
  renderTableHeader();
  renderTableBody();
  renderPagination();
}

function renderTableHeader() {
  const headerRow = document.createElement('tr');

  for (const col of TABLE_COLUMNS) {
    const th = document.createElement('th');
    th.textContent = col;

    const sortIcon = document.createElement('span');
    sortIcon.className = 'sort-icon material-symbols-rounded';
    sortIcon.textContent = sortColumn === col
      ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward')
      : 'unfold_more';
    th.appendChild(sortIcon);

    if (sortColumn === col) th.classList.add('sorted');

    th.addEventListener('click', () => {
      if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = col;
        sortDirection = 'asc';
      }
      applyFilters();
    });

    headerRow.appendChild(th);
  }

  dataTableHead.innerHTML = '';
  dataTableHead.appendChild(headerRow);
}

function renderTableBody() {
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, filteredData.length);
  const pageData = filteredData.slice(start, end);

  dataTableBody.innerHTML = '';

  for (const record of pageData) {
    const tr = document.createElement('tr');

    for (const col of TABLE_COLUMNS) {
      const td = document.createElement('td');
      const val = record[col] ?? '';

      if (col === 'Status (GSPN)') {
        td.innerHTML = statusPillHTML(val);
      } else if (col === 'Aging') {
        td.innerHTML = agingPillHTML(val);
      } else if (col === 'REDO') {
        td.innerHTML = val.toUpperCase() === 'Y'
          ? '<span style="color:var(--accent-danger);font-weight:700;">Y</span>'
          : '<span style="color:var(--text-muted);">N</span>';
      } else {
        td.textContent = val;
      }

      tr.appendChild(td);
    }

    dataTableBody.appendChild(tr);
  }

  paginationInfo.textContent = filteredData.length > 0
    ? `Showing ${start + 1}–${end} of ${filteredData.length}`
    : 'No records';
}

function statusPillHTML(status) {
  const s = (status || '').toLowerCase();
  let cls = 'default';
  if (s.includes('engineer assigned')) cls = 'engineer-assigned';
  else if (s.includes('part') || s.includes('pending')) cls = 'part-pending';
  else if (s.includes('completed') || s.includes('closed')) cls = 'completed';
  else if (s.includes('cancel')) cls = 'cancelled';
  return `<span class="status-pill ${cls}">${status}</span>`;
}

function agingPillHTML(val) {
  const n = parseInt(val, 10) || 0;
  let cls = 'low';
  if (n > 7) cls = 'high';
  else if (n > 3) cls = 'medium';
  return `<span class="aging-pill ${cls}">${n}</span>`;
}

function renderPagination() {
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE) || 1;
  paginationControls.innerHTML = '';

  // Prev button
  const prev = document.createElement('button');
  prev.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">chevron_left</span>';
  prev.disabled = currentPage === 1;
  prev.addEventListener('click', () => { currentPage--; renderTableBody(); renderPagination(); });
  paginationControls.appendChild(prev);

  // Page buttons (max 7 visible)
  const pages = getPaginationRange(currentPage, totalPages, 7);
  for (const p of pages) {
    if (p === '...') {
      const dots = document.createElement('button');
      dots.textContent = '…';
      dots.disabled = true;
      dots.style.border = 'none';
      dots.style.background = 'transparent';
      paginationControls.appendChild(dots);
    } else {
      const btn = document.createElement('button');
      btn.textContent = p;
      if (p === currentPage) btn.classList.add('active');
      btn.addEventListener('click', () => { currentPage = p; renderTableBody(); renderPagination(); });
      paginationControls.appendChild(btn);
    }
  }

  // Next button
  const next = document.createElement('button');
  next.innerHTML = '<span class="material-symbols-rounded" style="font-size:16px">chevron_right</span>';
  next.disabled = currentPage === totalPages;
  next.addEventListener('click', () => { currentPage++; renderTableBody(); renderPagination(); });
  paginationControls.appendChild(next);
}

function getPaginationRange(current, total, maxVisible) {
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [];
  pages.push(1);

  let start = Math.max(2, current - 1);
  let end = Math.min(total - 1, current + 1);

  if (current <= 3) { start = 2; end = Math.min(4, total - 1); }
  if (current >= total - 2) { start = Math.max(total - 3, 2); end = total - 1; }

  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('...');

  pages.push(total);
  return pages;
}

// ---- Chart Rendering ----
function getChartTextColor() {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' ? '#6b7280' : '#9ca3af';
}

function getChartGridColor() {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
}

function destroyAllCharts() {
  for (const key of Object.keys(chartInstances)) {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      delete chartInstances[key];
    }
  }
}

function renderAllCharts() {
  destroyAllCharts();
  renderProductCategoryChart();
  renderStatusChart();
  renderAgingChart();
  renderEngineerChart();
  renderWarrantyChart();
  renderServiceTypeChart();
  renderDailyTrendChart();
}

function groupBy(data, key) {
  const map = {};
  for (const item of data) {
    const val = (item[key] || 'Unknown').trim();
    map[val] = (map[val] || 0) + 1;
  }
  // Sort by count desc
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function renderProductCategoryChart() {
  const groups = groupBy(parsedData, 'Product');
  const labels = groups.map(g => g[0]);
  const values = groups.map(g => g[1]);

  chartInstances.product = new Chart(
    document.getElementById('chartProductCategory'),
    {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: CHART_COLORS.slice(0, labels.length),
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: getChartTextColor(),
              padding: 12,
              usePointStyle: true,
              pointStyleWidth: 10,
              font: { size: 11, family: 'Inter' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' },
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${((ctx.parsed / parsedData.length) * 100).toFixed(1)}%)`
            }
          }
        }
      }
    }
  );
}

function renderStatusChart() {
  const groups = groupBy(parsedData, 'Status (GSPN)');
  const labels = groups.map(g => g[0]);
  const values = groups.map(g => g[1]);

  chartInstances.status = new Chart(
    document.getElementById('chartStatus'),
    {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Count',
          data: values,
          backgroundColor: CHART_COLORS.slice(0, labels.length).map(c => c + '99'),
          borderColor: CHART_COLORS.slice(0, labels.length),
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' }
          }
        },
        scales: {
          x: {
            grid: { color: getChartGridColor() },
            ticks: { color: getChartTextColor(), font: { size: 10, family: 'Inter' } }
          },
          y: {
            grid: { display: false },
            ticks: { color: getChartTextColor(), font: { size: 10, family: 'Inter' } }
          }
        }
      }
    }
  );
}

function renderAgingChart() {
  const buckets = { '0-1 day': 0, '2-3 days': 0, '4-7 days': 0, '8-14 days': 0, '15+ days': 0 };

  for (const r of parsedData) {
    const a = parseInt(r['Aging'], 10) || 0;
    if (a <= 1) buckets['0-1 day']++;
    else if (a <= 3) buckets['2-3 days']++;
    else if (a <= 7) buckets['4-7 days']++;
    else if (a <= 14) buckets['8-14 days']++;
    else buckets['15+ days']++;
  }

  const labels = Object.keys(buckets);
  const values = Object.values(buckets);
  const colors = ['#10b981', '#06b6d4', '#f59e0b', '#f97316', '#ef4444'];

  chartInstances.aging = new Chart(
    document.getElementById('chartAging'),
    {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tickets',
          data: values,
          backgroundColor: colors.map(c => c + '99'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.65
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: getChartTextColor(), font: { size: 10, family: 'Inter' } }
          },
          y: {
            grid: { color: getChartGridColor() },
            ticks: { color: getChartTextColor(), font: { size: 10, family: 'Inter' } },
            beginAtZero: true
          }
        }
      }
    }
  );
}

function renderEngineerChart() {
  const groups = groupBy(parsedData, 'Engineer');
  // Show top 10
  const top = groups.slice(0, 10);
  const labels = top.map(g => g[0]);
  const values = top.map(g => g[1]);

  chartInstances.engineer = new Chart(
    document.getElementById('chartEngineer'),
    {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Assigned Tickets',
          data: values,
          backgroundColor: 'rgba(99, 102, 241, 0.6)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.65
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: getChartTextColor(),
              font: { size: 9, family: 'Inter' },
              maxRotation: 45,
              minRotation: 30
            }
          },
          y: {
            grid: { color: getChartGridColor() },
            ticks: { color: getChartTextColor(), font: { size: 10, family: 'Inter' } },
            beginAtZero: true
          }
        }
      }
    }
  );
}

function renderWarrantyChart() {
  let inW = 0, outW = 0;
  for (const r of parsedData) {
    const s = (r['Wty Status'] || '').toLowerCase();
    if (s.includes('in warranty') && !s.includes('out')) inW++;
    else outW++;
  }

  chartInstances.warranty = new Chart(
    document.getElementById('chartWarranty'),
    {
      type: 'pie',
      data: {
        labels: ['In Warranty', 'Out of Warranty'],
        datasets: [{
          data: [inW, outW],
          backgroundColor: ['#10b98199', '#ef444499'],
          borderColor: ['#10b981', '#ef4444'],
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getChartTextColor(),
              padding: 16,
              usePointStyle: true,
              font: { size: 11, family: 'Inter' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' },
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${((ctx.parsed / parsedData.length) * 100).toFixed(1)}%)`
            }
          }
        }
      }
    }
  );
}

function renderServiceTypeChart() {
  const groups = groupBy(parsedData, 'Service Type');
  const labels = groups.map(g => g[0]);
  const values = groups.map(g => g[1]);

  chartInstances.serviceType = new Chart(
    document.getElementById('chartServiceType'),
    {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: CHART_COLORS.slice(5, 5 + labels.length),
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getChartTextColor(),
              padding: 12,
              usePointStyle: true,
              font: { size: 11, family: 'Inter' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' }
          }
        }
      }
    }
  );
}

function renderDailyTrendChart() {
  const dateMap = {};
  for (const r of parsedData) {
    const dateStr = (r['Short ASC Assigned Date'] || '').trim();
    if (!dateStr || dateStr.length < 5) continue;
    dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
  }

  // Sort by date
  const entries = Object.entries(dateMap).sort((a, b) => {
    const da = parseDate(a[0]);
    const db = parseDate(b[0]);
    return (da || 0) - (db || 0);
  });

  const labels = entries.map(e => e[0]);
  const values = entries.map(e => e[1]);

  chartInstances.trend = new Chart(
    document.getElementById('chartDailyTrend'),
    {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Tickets Assigned',
          data: values,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#6366f1',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleFont: { family: 'Inter' },
            bodyFont: { family: 'Inter' }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: getChartTextColor(), font: { size: 9, family: 'Inter' }, maxRotation: 45 }
          },
          y: {
            grid: { color: getChartGridColor() },
            ticks: { color: getChartTextColor(), font: { size: 10, family: 'Inter' } },
            beginAtZero: true
          }
        }
      }
    }
  );
}

function parseDate(str) {
  if (!str) return null;
  // Handle dd-mm-yy, dd/mm/yyyy, dd.mm.yyyy
  const parts = str.split(/[\/\-\.]/);
  if (parts.length !== 3) return null;

  let day = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);

  if (year < 100) year += 2000;

  return new Date(year, month - 1, day);
}

// ---- Reset ----
function resetDashboard() {
  parsedData = [];
  filteredData = [];
  currentPage = 1;
  sortColumn = null;
  sortDirection = 'asc';

  destroyAllCharts();

  dashboard.classList.remove('visible');
  loadAnotherBar.classList.remove('visible');
  fileBadge.classList.remove('visible');
  uploadZone.classList.remove('hidden-zone');

  tableSearch.value = '';
  filterProduct.value = '';
  filterStatus.value = '';
  filterEngineer.value = '';

  dataTableHead.innerHTML = '';
  dataTableBody.innerHTML = '';
  paginationControls.innerHTML = '';
}

// ---- Export ----
function exportToExcel() {
  if (filteredData.length === 0) return;

  const columns = TABLE_COLUMNS;

  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
  html += '<head><meta charset="utf-8"><style>td{padding:4px 8px;border:1px solid #ccc;font-family:Arial;font-size:11px;}th{padding:6px 8px;border:1px solid #999;background:#4472C4;color:#fff;font-family:Arial;font-size:11px;font-weight:bold;}</style></head><body>';
  html += '<table>';

  // Header
  html += '<tr>';
  for (const col of columns) {
    html += `<th>${col}</th>`;
  }
  html += '</tr>';

  // Data
  for (const rec of filteredData) {
    html += '<tr>';
    for (const col of columns) {
      html += `<td>${rec[col] ?? ''}</td>`;
    }
    html += '</tr>';
  }

  html += '</table></body></html>';

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
  a.download = `Pending_Analysis_${dateStr}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
