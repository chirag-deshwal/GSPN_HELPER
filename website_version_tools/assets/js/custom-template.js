/**
 * custom-template.js — Custom Template Builder for GSPN Tools
 * Allows users to upload any Excel / ODS / CSV file, get column details,
 * and drag & drop extracted GSPN fields like puzzle pieces into target slots.
 */

(function() {
  'use strict';

  // Standard GSPN fields fallback
  var STANDARD_GSPN_KEYS = [
    'Service Order No', 'ASC Job No', 'Customer Name', 'Customer No',
    'Telephone(Mobile)', 'Telephone(Home)', 'Telephone(Office)',
    'City', 'Address', 'Model', 'Product', 'Serial', 'Wty Status', 'TAT',
    'Service Type', 'Status', 'Reason', 'Created', 'Assigned', 'Assigned Time',
    'App Date', 'App Time', 'Engineer', 'Symptom 1', 'Symptom 2', 'Symptom 3',
    '1st Service Comment', 'Remark', 'VOC', 'REDO', 'High Priority'
  ];

  // Preset templates for quick 1-click test
  var PRESETS = {
    technician: {
      name: 'Technician Handover Sheet',
      columns: ['Job Number', 'Customer Name', 'Mobile Number', 'Full Address', 'Model & Product', 'Reported Defect', 'Engineer Assigned']
    },
    dispatch: {
      name: 'Daily In-Home Dispatch',
      columns: ['Call ID', 'Customer', 'Phone', 'Location', 'Product Model', 'Serial No', 'TAT (Days)', 'Call Status']
    },
    summary: {
      name: 'Executive Summary Format',
      columns: ['Service Order', 'Customer', 'City', 'Model', 'Warranty', 'TAT', 'Engineer', 'Status']
    }
  };

  // State
  var state = {
    templateId: null,
    templateName: 'Custom Template ' + new Date().toLocaleDateString(),
    targetColumns: [],     // Array of { id, name, sampleVal, sources: [], separator: ' ' }
    sourceKeys: [],        // Available data fields
    sampleRecords: [],     // Extracted or dummy sample rows
    hasLiveRecords: false,
    draggedKey: null,
    layoutMode: localStorage.getItem('gspn_puzzle_layout') || 'grid' // 'grid' | 'asymmetric' | 'compact'
  };

  // ── Initialization ────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    initSourceData();
    renderSourceChips();
    loadSavedTemplatesList();

    // Check URL query parameters for ?edit=ID
    var urlParams = new URLSearchParams(window.location.search);
    var editId = urlParams.get('edit');
    if (editId) {
      loadTemplateById(editId);
    } else {
      // Default to Technician preset to give immediate interactive board
      applyPreset('technician');
    }

    setupEventListeners();
  });

  // ── Source Data Setup ─────────────────────────────────────────────────────
  function initSourceData() {
    var rawData = null;
    try {
      var saved = localStorage.getItem('gspn_extracted_data');
      if (saved) rawData = JSON.parse(saved);
      if (!rawData) {
        var stateSaved = localStorage.getItem('gspn_tools_state');
        if (stateSaved) {
          var parsed = JSON.parse(stateSaved);
          if (parsed && parsed.data && parsed.data.length > 0) {
            rawData = { data: parsed.data, columns: parsed.columns };
          }
        }
      }
    } catch(e) {}

    if (rawData && rawData.data && rawData.data.length > 0) {
      state.hasLiveRecords = true;
      state.sampleRecords = rawData.data;
      var keyMap = {};
      for (var i = 0; i < rawData.data.length; i++) {
        for (var k in rawData.data[i]) {
          if (k !== '_isMerged') keyMap[k] = true;
        }
      }
      state.sourceKeys = Object.keys(keyMap);
      updateSessionBanner(rawData.data.length);
    } else {
      state.hasLiveRecords = false;
      state.sourceKeys = STANDARD_GSPN_KEYS.slice();
      state.sampleRecords = generateMockRecords();
      updateSessionBanner(0);
    }
  }

  function updateSessionBanner(count) {
    var banner = document.getElementById('sessionDataBanner');
    if (!banner) return;
    if (count > 0) {
      banner.innerHTML = '<span class="status-dot green"></span> Live Extracted Session Data Active (' +
        count + ' calls loaded from Tools page)';
      banner.style.color = '#059669';
    } else {
      banner.innerHTML = '<span class="status-dot orange"></span> Standard GSPN fields active (Extract data on <a href="tools.html" style="color:var(--primary);text-decoration:underline;">Tools</a> for live preview)';
      banner.style.color = '#d97706';
    }
  }

  function generateMockRecords() {
    return [
      {
        'Service Order No': '4437419726',
        'ASC Job No': 'GGN-2026-001',
        'Customer Name': 'Rajesh Sharma',
        'Customer No': 'CUST-8819',
        'Telephone(Mobile)': '9811223344',
        'City': 'Gurgaon',
        'Address': 'Flat 302, Palm Grove Heights, Sec 54',
        'Model': 'WA65A4002VS/TL',
        'Product': 'W/M',
        'Serial': '0A1B2C3D4E5F',
        'Wty Status': 'In Warranty',
        'TAT': '1d',
        'Service Type': 'IH (In-Home)',
        'Status': 'Assigned to Engineer',
        'Reason': 'Customer Available evening',
        'Created': '2026-09-05 10:30',
        'Assigned': '2026-09-05 11:00',
        'Engineer': 'Amit Kumar',
        'Symptom 1': 'Power',
        'Symptom 2': 'No Power',
        'Symptom 3': 'Dead',
        '1st Service Comment': 'Checking main PCB board',
        'Remark': 'Call before visit'
      },
      {
        'Service Order No': '4437419727',
        'ASC Job No': 'GGN-2026-002',
        'Customer Name': 'Pooja Verma',
        'Customer No': 'CUST-9920',
        'Telephone(Mobile)': '9899001122',
        'City': 'Delhi',
        'Address': 'B-12, Block C, Vasant Vihar',
        'Model': 'RT28C3052SE/HL',
        'Product': 'REF',
        'Serial': '9Z8Y7X6W5V4U',
        'Wty Status': 'Out Warranty',
        'TAT': '3d',
        'Service Type': 'IH (In-Home)',
        'Status': 'Pending Part',
        'Reason': 'Compressor relay ordered',
        'Created': '2026-09-03 14:15',
        'Assigned': '2026-09-03 15:00',
        'Engineer': 'Suresh Yadav',
        'Symptom 1': 'Cooling',
        'Symptom 2': 'No Cooling',
        'Symptom 3': 'Gas leakage',
        '1st Service Comment': 'Part requested to branch',
        'Remark': 'Customer requested urgent repair'
      }
    ];
  }

  // ── Render Draggable Source Chips (Puzzle Pieces) ─────────────────────────
  function renderSourceChips(filterText) {
    var container = document.getElementById('sourceChipsPool');
    if (!container) return;

    var filter = (filterText || '').toLowerCase().trim();
    var keys = state.sourceKeys.filter(function(k) {
      return !filter || k.toLowerCase().indexOf(filter) !== -1;
    });

    var html = '';
    keys.forEach(function(key) {
      var sample = state.sampleRecords.length > 0 ? (state.sampleRecords[0][key] || '') : '';
      var title = sample ? 'Sample: ' + sample : 'Click or drag to map';
      html += '<div class="puzzle-chip" draggable="true" data-key="' + escapeHtml(key) + '" title="' + escapeHtml(title) + '" onclick="window.customTpl.onChipClicked(\'' + escapeHtml(key) + '\')">' +
        '<span class="puzzle-chip-handle">⠿</span>' +
        '<span class="puzzle-chip-icon">🧩</span>' +
        '<span class="puzzle-chip-text">' + escapeHtml(key) + '</span>' +
        '</div>';
    });

    if (keys.length === 0) {
      html = '<div style="color:var(--text-soft);font-size:12px;padding:8px;">No matching fields found.</div>';
    }

    container.innerHTML = html;
    attachSourceChipDragEvents();
  }

  function attachSourceChipDragEvents() {
    var chips = document.querySelectorAll('.puzzle-chip');
    chips.forEach(function(chip) {
      chip.addEventListener('dragstart', function(e) {
        var key = chip.dataset.key;
        state.draggedKey = key;
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'copy';
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', function() {
        chip.classList.remove('dragging');
        state.draggedKey = null;
      });
    });
  }

  // ── Layout Switcher ───────────────────────────────────────────────────────
  function setLayout(mode) {
    state.layoutMode = mode;
    try { localStorage.setItem('gspn_puzzle_layout', mode); } catch(e) {}
    updateLayoutToggleButtons();
    var container = document.getElementById('puzzleBoardSlots');
    if (container) {
      container.className = 'puzzle-slots-list layout-' + mode;
    }
  }

  function updateLayoutToggleButtons() {
    var bGrid = document.getElementById('btnLayoutGrid');
    var bAsym = document.getElementById('btnLayoutAsym');
    var bComp = document.getElementById('btnLayoutCompact');
    if (bGrid) bGrid.classList.toggle('active', state.layoutMode === 'grid');
    if (bAsym) bAsym.classList.toggle('active', state.layoutMode === 'asymmetric');
    if (bComp) bComp.classList.toggle('active', state.layoutMode === 'compact');
  }

  // ── Puzzle Board Rendering (Target Slots) ─────────────────────────────────
  function renderPuzzleSlots() {
    var container = document.getElementById('puzzleBoardSlots');
    var countEl = document.getElementById('targetColsCount');
    if (!container) return;

    container.className = 'puzzle-slots-list layout-' + state.layoutMode;
    updateLayoutToggleButtons();

    if (countEl) countEl.textContent = state.targetColumns.length + ' column(s)';

    if (state.targetColumns.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-soft);border:2px dashed #cbd5e1;border-radius:14px;grid-column: 1 / -1;">' +
        '<div style="font-size:36px;margin-bottom:8px;">📂</div>' +
        '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;">No Target Columns Defined Yet</div>' +
        '<div style="font-size:12px;max-width:400px;margin:0 auto 16px;">Upload an Excel/ODS/CSV file above, pick a preset, or click "+ Add Column" to start building your custom template.</div>' +
        '<button class="btn-secondary" onclick="window.customTpl.addNewSlot()" style="display:inline-flex;align-items:center;gap:6px;">+ Add First Column</button>' +
        '</div>';
      renderLivePreviewTable();
      return;
    }

    var html = '';
    state.targetColumns.forEach(function(col, idx) {
      var hasSources = col.sources && col.sources.length > 0;
      var isCombined = col.sources && col.sources.length > 1;
      var liveVal = computeColumnValue(col, state.sampleRecords[0] || {});

      var cardClasses = 'puzzle-slot-card' +
        (hasSources ? ' has-content' : '') +
        (isCombined ? ' is-combined' : '');

      html += '<div class="' + cardClasses + '" id="slotCard_' + idx + '">' +
        '<div class="slot-header">' +
        '  <div class="slot-num">#' + (idx + 1) + '</div>' +
        '  <input type="text" class="slot-title-input" value="' + escapeHtml(col.name) + '" onchange="window.customTpl.updateColName(' + idx + ', this.value)" placeholder="Column Name" title="Click to rename" />' +
        '  <div class="slot-actions">' +
        '    <button class="slot-btn-remove" title="Remove column" onclick="window.customTpl.removeSlot(' + idx + ')">✕</button>' +
        '  </div>' +
        '</div>';

      // Drop Zone (compact)
      html += '<div class="puzzle-dropzone ' + (hasSources ? 'has-content' : 'empty') + '" data-slot-idx="' + idx + '" ondragover="window.customTpl.onDropZoneOver(event)" ondragleave="window.customTpl.onDropZoneLeave(event)" ondrop="window.customTpl.onDropZoneDrop(event, ' + idx + ')">';

      if (!hasSources) {
        html += '<div class="dropzone-empty-hint">' +
          '<span style="font-size:15px;">📥</span>' +
          '<span>Drop piece or click to map</span>' +
          '</div>';
      } else {
        html += '<div class="slot-mapped-chips">';
        col.sources.forEach(function(src, srcIdx) {
          var isStatic = src.indexOf('__STATIC__:') === 0;
          var displayName = isStatic ? '“' + src.substring(10) + '”' : src;
          html += '<div class="mapped-chip ' + (isStatic ? 'is-static' : '') + '">' +
            '<span class="mapped-chip-icon">' + (isStatic ? '🔤' : '🧩') + '</span>' +
            '<span class="mapped-chip-text">' + escapeHtml(displayName) + '</span>' +
            '<button class="mapped-chip-del" onclick="window.customTpl.removeSourceFromSlot(' + idx + ', ' + srcIdx + ')" title="Remove">×</button>' +
            '</div>';
        });
        html += '</div>';

        // Separator selector if more than 1 piece combined
        if (col.sources.length > 1) {
          html += '<div class="slot-combine-bar">' +
            '<span style="font-size:10px;color:var(--text-soft);font-weight:700;">Join:</span>' +
            '<select class="slot-sep-select" onchange="window.customTpl.updateColSep(' + idx + ', this.value)">' +
            '  <option value=" "' + (col.separator === ' ' ? ' selected' : '') + '>Space (" ")</option>' +
            '  <option value=", "' + (col.separator === ', ' ? ' selected' : '') + '>Comma (", ")</option>' +
            '  <option value=" - "' + (col.separator === ' - ' ? ' selected' : '') + '>Dash (" - ")</option>' +
            '  <option value=" / "' + (col.separator === ' / ' ? ' selected' : '') + '>Slash (" / ")</option>' +
            '  <option value=""' + (col.separator === '' ? ' selected' : '') + '>None</option>' +
            '</select>' +
            '</div>';
        }
      }

      html += '</div>'; // /dropzone

      // Value Preview Strip (compact)
      html += '<div class="slot-preview-footer">' +
        '<span class="preview-label">Row 1:</span>' +
        '<span class="preview-val" title="' + escapeHtml(liveVal) + '">' + (liveVal ? escapeHtml(liveVal) : '<em style="color:#cbd5e1;">(empty)</em>') + '</span>' +
        '</div>';

      html += '</div>'; // /card
    });

    container.innerHTML = html;
    renderLivePreviewTable();
  }

  // Compute cell value for a column definition
  function computeColumnValue(colDef, row) {
    if (!colDef.sources || colDef.sources.length === 0) {
      return colDef.sampleVal || '';
    }
    var parts = [];
    colDef.sources.forEach(function(src) {
      if (src.indexOf('__STATIC__:') === 0) {
        parts.push(src.substring(10));
      } else if (row[src] !== undefined && row[src] !== null && row[src] !== '') {
        parts.push(row[src]);
      }
    });
    return parts.join(colDef.separator !== undefined ? colDef.separator : ' ');
  }

  // ── Drag & Drop Event Handlers ────────────────────────────────────────────
  function onDropZoneOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    var target = e.currentTarget;
    target.classList.add('drag-over');
  }

  function onDropZoneLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  }

  function onDropZoneDrop(e, slotIdx) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    var key = e.dataTransfer.getData('text/plain') || state.draggedKey;
    if (!key) return;

    addSourceToSlot(slotIdx, key);
  }

  function addSourceToSlot(slotIdx, key) {
    if (!state.targetColumns[slotIdx]) return;
    var col = state.targetColumns[slotIdx];
    if (!col.sources) col.sources = [];

    // Avoid duplicate of identical key in same slot unless static
    if (key.indexOf('__STATIC__:') !== 0 && col.sources.indexOf(key) !== -1) {
      showToast('"' + key + '" is already in this slot.', 'error');
      return;
    }

    col.sources.push(key);
    renderPuzzleSlots();
    showToast('Mapped "' + key + '" to [' + col.name + ']', 'success');
  }

  function removeSourceFromSlot(slotIdx, srcIdx) {
    if (!state.targetColumns[slotIdx]) return;
    state.targetColumns[slotIdx].sources.splice(srcIdx, 1);
    renderPuzzleSlots();
  }

  function updateColName(slotIdx, newName) {
    if (!state.targetColumns[slotIdx]) return;
    state.targetColumns[slotIdx].name = newName.trim() || ('Column ' + (slotIdx + 1));
    renderLivePreviewTable();
  }

  function updateColSep(slotIdx, newSep) {
    if (!state.targetColumns[slotIdx]) return;
    state.targetColumns[slotIdx].separator = newSep;
    renderPuzzleSlots();
  }

  function removeSlot(slotIdx) {
    state.targetColumns.splice(slotIdx, 1);
    renderPuzzleSlots();
  }

  function addNewSlot(colName) {
    var name = colName || ('Column ' + (state.targetColumns.length + 1));
    state.targetColumns.push({
      id: 'col_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: name,
      sampleVal: '',
      sources: [],
      separator: ' '
    });
    renderPuzzleSlots();
  }

  // Quick click handler: if user clicks a chip without dragging, drop into first empty slot
  function onChipClicked(key) {
    var emptySlotIdx = -1;
    for (var i = 0; i < state.targetColumns.length; i++) {
      if (!state.targetColumns[i].sources || state.targetColumns[i].sources.length === 0) {
        emptySlotIdx = i;
        break;
      }
    }

    if (emptySlotIdx !== -1) {
      addSourceToSlot(emptySlotIdx, key);
    } else {
      // Prompt user or add to new slot
      addNewSlot(key);
      addSourceToSlot(state.targetColumns.length - 1, key);
    }
  }

  // ── Auto-Match Algorithm (Magic Wand ✨) ──────────────────────────────────
  function autoMatchAll() {
    if (state.targetColumns.length === 0) {
      showToast('No target columns to match. Upload a file or add columns first.', 'error');
      return;
    }

    var matchCount = 0;

    // Normalizer
    function norm(s) {
      return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // Synonym map
    var synonyms = {
      'order': 'serviceorderno',
      'orderno': 'serviceorderno',
      'job': 'serviceorderno',
      'jobno': 'serviceorderno',
      'serviceorder': 'serviceorderno',
      'callid': 'serviceorderno',
      'cust': 'customername',
      'customer': 'customername',
      'name': 'customername',
      'phone': 'telephonemobile',
      'mobile': 'telephonemobile',
      'contact': 'telephonemobile',
      'cell': 'telephonemobile',
      'mob': 'telephonemobile',
      'addr': 'address',
      'location': 'address',
      'model': 'model',
      'modelno': 'model',
      'product': 'product',
      'serial': 'serial',
      'serialno': 'serial',
      'imei': 'serial',
      'wty': 'wtystatus',
      'warranty': 'wtystatus',
      'warrantystatus': 'wtystatus',
      'tat': 'tat',
      'tatdays': 'tat',
      'eng': 'engineer',
      'engineer': 'engineer',
      'technician': 'engineer',
      'tech': 'engineer',
      'status': 'status',
      'callstatus': 'status',
      'city': 'city',
      'defect': 'symptom1',
      'symptom': 'symptom1',
      'comment': '1stservicecomment',
      'remark': 'remark'
    };

    state.targetColumns.forEach(function(col) {
      if (col.sources && col.sources.length > 0) return; // Keep already mapped

      var colNorm = norm(col.name);
      var bestKey = null;

      // 1. Direct normalized match
      for (var i = 0; i < state.sourceKeys.length; i++) {
        var k = state.sourceKeys[i];
        if (norm(k) === colNorm) {
          bestKey = k;
          break;
        }
      }

      // 2. Synonym match
      if (!bestKey) {
        var synKeyNorm = synonyms[colNorm];
        if (synKeyNorm) {
          for (var j = 0; j < state.sourceKeys.length; j++) {
            if (norm(state.sourceKeys[j]) === synKeyNorm) {
              bestKey = state.sourceKeys[j];
              break;
            }
          }
        }
      }

      // 3. Substring match
      if (!bestKey) {
        for (var m = 0; m < state.sourceKeys.length; m++) {
          var skNorm = norm(state.sourceKeys[m]);
          if (colNorm.indexOf(skNorm) !== -1 || skNorm.indexOf(colNorm) !== -1) {
            bestKey = state.sourceKeys[m];
            break;
          }
        }
      }

      if (bestKey) {
        col.sources = [bestKey];
        matchCount++;
      }
    });

    renderPuzzleSlots();
    if (matchCount > 0) {
      showToast('✨ Auto-matched ' + matchCount + ' column(s)!', 'success');
    } else {
      showToast('No new matching fields found.', 'idle');
    }
  }

  function clearAllMappings() {
    state.targetColumns.forEach(function(col) { col.sources = []; });
    renderPuzzleSlots();
    showToast('Cleared all slot mappings.', 'idle');
  }

  // ── File Upload / Parser (Excel, ODS, CSV) ────────────────────────────────
  function handleUploadedFile(file) {
    if (!file) return;
    var filename = file.name;
    var ext = filename.split('.').pop().toLowerCase();

    var statusEl = document.getElementById('uploadStatus');
    if (statusEl) {
      statusEl.textContent = 'Parsing ' + filename + '...';
      statusEl.style.display = 'block';
    }

    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
      // Native text parser
      var reader = new FileReader();
      reader.onload = function(e) {
        parseDelimitedText(e.target.result, ext === 'tsv' ? '\t' : ',');
        finishUpload(filename);
      };
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
      // Check for XLSX library
      if (typeof XLSX !== 'undefined') {
        var reader2 = new FileReader();
        reader2.onload = function(e) {
          try {
            var data = new Uint8Array(e.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            var json = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
            if (json && json.length > 0) {
              var headers = json[0];
              var sampleRow = json.length > 1 ? json[1] : [];
              buildTargetColumnsFromArrays(headers, sampleRow);
              finishUpload(filename);
            } else {
              showToast('Uploaded spreadsheet is empty.', 'error');
            }
          } catch(err) {
            console.error(err);
            showToast('Failed to parse spreadsheet: ' + err.message, 'error');
          }
        };
        reader2.readAsArrayBuffer(file);
      } else {
        // Fallback warning
        showToast('SheetJS parser library is loading. Please try CSV or wait 2 seconds.', 'error');
      }
    } else {
      showToast('Unsupported file format. Please upload .xlsx, .xls, .ods, or .csv', 'error');
    }
  }

  function parseDelimitedText(text, delimiter) {
    var lines = text.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return;

    var headers = lines[0].split(delimiter).map(function(h) {
      return h.trim().replace(/^["']|["']$/g, '');
    });
    var sampleRow = [];
    if (lines.length > 1) {
      sampleRow = lines[1].split(delimiter).map(function(s) {
        return s.trim().replace(/^["']|["']$/g, '');
      });
    }

    buildTargetColumnsFromArrays(headers, sampleRow);
  }

  function buildTargetColumnsFromArrays(headers, sampleRow) {
    var cols = [];
    headers.forEach(function(h, idx) {
      var name = (h || '').toString().trim();
      if (!name) name = 'Column ' + (idx + 1);
      var sample = (sampleRow && sampleRow[idx] !== undefined) ? sampleRow[idx].toString().trim() : '';
      cols.push({
        id: 'col_' + idx + '_' + Math.random().toString(36).substring(2, 6),
        name: name,
        sampleVal: sample,
        sources: [],
        separator: ' '
      });
    });

    state.targetColumns = cols;
    renderPuzzleSlots();
    // Prompt auto-match automatically
    setTimeout(autoMatchAll, 200);
  }

  function finishUpload(filename) {
    var nameInput = document.getElementById('templateNameInput');
    if (nameInput) {
      var cleanName = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      nameInput.value = cleanName;
      state.templateName = cleanName;
    }
    var statusEl = document.getElementById('uploadStatus');
    if (statusEl) {
      statusEl.textContent = '✓ Loaded ' + state.targetColumns.length + ' columns from ' + filename;
      statusEl.style.color = '#059669';
    }
    showToast('Loaded ' + state.targetColumns.length + ' columns from ' + filename, 'success');
  }

  // ── Presets ───────────────────────────────────────────────────────────────
  function applyPreset(presetKey) {
    var p = PRESETS[presetKey];
    if (!p) return;

    var nameInput = document.getElementById('templateNameInput');
    if (nameInput) nameInput.value = p.name;
    state.templateName = p.name;

    state.targetColumns = p.columns.map(function(colName, idx) {
      return {
        id: 'col_' + idx,
        name: colName,
        sampleVal: '',
        sources: [],
        separator: ' '
      };
    });

    renderPuzzleSlots();
    autoMatchAll();
  }

  // ── Live Preview Table ────────────────────────────────────────────────────
  function renderLivePreviewTable() {
    var head = document.getElementById('previewTableHead');
    var body = document.getElementById('previewTableBody');
    var info = document.getElementById('previewTableInfo');
    if (!head || !body) return;

    if (state.targetColumns.length === 0) {
      head.innerHTML = '<tr><th>No Columns</th></tr>';
      body.innerHTML = '<tr><td style="text-align:center;color:var(--text-soft);padding:24px;">Define target columns above to preview.</td></tr>';
      if (info) info.textContent = '0 columns';
      return;
    }

    // Headers
    var hHTML = '<tr><th style="font-size:10px;width:36px;text-align:center;">#</th>';
    state.targetColumns.forEach(function(col) {
      hHTML += '<th>' + escapeHtml(col.name) + '</th>';
    });
    hHTML += '</tr>';
    head.innerHTML = hHTML;

    // Body
    var displayRows = state.sampleRecords.slice(0, 5);
    var bHTML = '';
    displayRows.forEach(function(row, rIdx) {
      bHTML += '<tr>';
      bHTML += '<td style="text-align:center;font-size:10px;color:#94a3b8;font-weight:600;background:rgba(241,245,249,0.7);">' + (rIdx + 1) + '</td>';
      state.targetColumns.forEach(function(col) {
        var val = computeColumnValue(col, row);
        bHTML += '<td>' + (val ? escapeHtml(val) : '<span style="color:#cbd5e1;">—</span>') + '</td>';
      });
      bHTML += '</tr>';
    });

    body.innerHTML = bHTML;
    if (info) {
      info.textContent = state.targetColumns.length + ' columns · ' + displayRows.length + ' sample row(s) shown';
    }
  }

  // ── Save / Load / Export Actions ──────────────────────────────────────────
  function getCustomTemplates() {
    try {
      var raw = localStorage.getItem('gspn_custom_templates');
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  }

  function saveCustomTemplate(redirectOnSave) {
    var nameInput = document.getElementById('templateNameInput');
    var name = (nameInput ? nameInput.value : state.templateName).trim();
    if (!name) name = 'Custom Template';

    if (state.targetColumns.length === 0) {
      showToast('Please add at least one column before saving.', 'error');
      return;
    }

    var id = state.templateId || ('tpl_' + Date.now());
    var templateObj = {
      id: id,
      name: name,
      columns: state.targetColumns.map(function(c) {
        return {
          name: c.name,
          sources: c.sources || [],
          separator: c.separator !== undefined ? c.separator : ' '
        };
      }),
      updatedAt: new Date().toISOString()
    };

    var list = getCustomTemplates();
    var foundIndex = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { foundIndex = i; break; }
    }

    if (foundIndex !== -1) {
      list[foundIndex] = templateObj;
    } else {
      list.push(templateObj);
    }

    try {
      localStorage.setItem('gspn_custom_templates', JSON.stringify(list));
      state.templateId = id;
      state.templateName = name;
      showToast('Template "' + name + '" saved successfully!', 'success');
      loadSavedTemplatesList();

      if (redirectOnSave) {
        // Set active in tools state and redirect
        try {
          var toolsState = localStorage.getItem('gspn_tools_state');
          var parsed = toolsState ? JSON.parse(toolsState) : {};
          parsed.template = 'CUSTOM_' + id;
          localStorage.setItem('gspn_tools_state', JSON.stringify(parsed));
        } catch(e) {}
        setTimeout(function() {
          window.location.href = 'tools.html';
        }, 400);
      }
    } catch(err) {
      showToast('Failed to save template: ' + err.message, 'error');
    }
  }

  function loadTemplateById(id) {
    var list = getCustomTemplates();
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { found = list[i]; break; }
    }
    if (!found) return;

    state.templateId = found.id;
    state.templateName = found.name;
    var nameInput = document.getElementById('templateNameInput');
    if (nameInput) nameInput.value = found.name;

    state.targetColumns = found.columns.map(function(c, idx) {
      return {
        id: 'col_' + idx,
        name: c.name,
        sampleVal: '',
        sources: c.sources || [],
        separator: c.separator !== undefined ? c.separator : ' '
      };
    });

    renderPuzzleSlots();
    showToast('Loaded template: ' + found.name, 'success');
  }

  function deleteSavedTemplate(id) {
    if (!confirm('Are you sure you want to delete this custom template?')) return;
    var list = getCustomTemplates().filter(function(t) { return t.id !== id; });
    try {
      localStorage.setItem('gspn_custom_templates', JSON.stringify(list));
      loadSavedTemplatesList();
      showToast('Template deleted.', 'idle');
    } catch(e) {}
  }

  function loadSavedTemplatesList() {
    var container = document.getElementById('savedTemplatesList');
    if (!container) return;

    var list = getCustomTemplates();
    if (list.length === 0) {
      container.innerHTML = '<div style="color:var(--text-soft);font-size:12px;padding:8px 0;">No saved custom templates yet.</div>';
      return;
    }

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:12px;margin-top:10px;">';
    list.forEach(function(t) {
      html += '<div class="section-card" style="padding:14px;margin-bottom:0;display:flex;flex-direction:column;justify-content:space-between;gap:10px;background:white;">' +
        '<div>' +
        '  <div style="font-weight:700;font-size:14px;color:var(--text);margin-bottom:3px;">' + escapeHtml(t.name) + '</div>' +
        '  <div style="font-size:11px;color:var(--text-soft);">' + (t.columns ? t.columns.length : 0) + ' columns mapped</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
        '  <button class="btn-ghost" style="padding:4px 10px;font-size:11px;flex:1;" onclick="window.customTpl.loadTemplateById(\'' + t.id + '\')">Load / Edit</button>' +
        '  <button class="btn-primary" style="padding:4px 10px;font-size:11px;" onclick="window.customTpl.useTemplateInTools(\'' + t.id + '\')">Use in Tools</button>' +
        '  <button class="btn-ghost" style="padding:4px 8px;font-size:11px;color:#dc2626;border-color:#fca5a5;" onclick="window.customTpl.deleteSavedTemplate(\'' + t.id + '\')">🗑️</button>' +
        '</div>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function useTemplateInTools(id) {
    try {
      var toolsState = localStorage.getItem('gspn_tools_state');
      var parsed = toolsState ? JSON.parse(toolsState) : {};
      parsed.template = 'CUSTOM_' + id;
      localStorage.setItem('gspn_tools_state', JSON.stringify(parsed));
    } catch(e) {}
    window.location.href = 'tools.html';
  }

  function exportTransformedExcel() {
    if (state.targetColumns.length === 0) {
      showToast('No columns defined to export.', 'error');
      return;
    }

    var cols = state.targetColumns.map(function(c) { return c.name; });
    var data = state.sampleRecords.map(function(row) {
      var r = {};
      state.targetColumns.forEach(function(col) {
        r[col.name] = computeColumnValue(col, row);
      });
      return r;
    });

    downloadExcel(cols, data, 'GSPN_Custom_' + state.templateName.replace(/[^a-zA-Z0-9_-]/g, '_'));
    showToast('Excel downloaded (' + cols.length + ' cols)!', 'success');
  }

  // ── Static Piece Modal / Prompt ──────────────────────────────────────────
  function addStaticPiecePrompt() {
    var val = prompt('Enter static text / value to add as a puzzle piece:\n(e.g., "SAMSUNG", "Pending", "Delhi Center")');
    if (val === null) return;
    val = val.trim();
    if (!val) return;

    var staticKey = '__STATIC__:' + val;
    // Add to first available slot or prompt
    var emptySlotIdx = -1;
    for (var i = 0; i < state.targetColumns.length; i++) {
      if (!state.targetColumns[i].sources || state.targetColumns[i].sources.length === 0) {
        emptySlotIdx = i;
        break;
      }
    }

    if (emptySlotIdx !== -1) {
      addSourceToSlot(emptySlotIdx, staticKey);
    } else {
      addNewSlot('Fixed Text');
      addSourceToSlot(state.targetColumns.length - 1, staticKey);
    }
  }

  // ── Event Listeners ───────────────────────────────────────────────────────
  function setupEventListeners() {
    // Search source chips
    var searchInput = document.getElementById('searchSourceChips');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        renderSourceChips(this.value);
      });
    }

    // Template name input
    var nameInput = document.getElementById('templateNameInput');
    if (nameInput) {
      nameInput.addEventListener('change', function() {
        state.templateName = this.value;
      });
    }

    // File input & Drag drop
    var fileInput = document.getElementById('templateFileInput');
    var dropZone = document.getElementById('fileDropZone');

    if (fileInput) {
      fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files[0]) {
          handleUploadedFile(e.target.files[0]);
        }
      });
    }

    if (dropZone) {
      dropZone.addEventListener('dragover', function(e) {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.background = 'rgba(37,99,235,0.06)';
      });
      dropZone.addEventListener('dragleave', function() {
        dropZone.style.borderColor = '#cbd5e1';
        dropZone.style.background = 'white';
      });
      dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.style.borderColor = '#cbd5e1';
        dropZone.style.background = 'white';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleUploadedFile(e.dataTransfer.files[0]);
        }
      });
      dropZone.addEventListener('click', function() {
        if (fileInput) fileInput.click();
      });
    }
  }

  // ── Global namespace export ───────────────────────────────────────────────
  window.customTpl = {
    onChipClicked: onChipClicked,
    onDropZoneOver: onDropZoneOver,
    onDropZoneLeave: onDropZoneLeave,
    onDropZoneDrop: onDropZoneDrop,
    removeSourceFromSlot: removeSourceFromSlot,
    updateColName: updateColName,
    updateColSep: updateColSep,
    removeSlot: removeSlot,
    addNewSlot: addNewSlot,
    autoMatchAll: autoMatchAll,
    clearAllMappings: clearAllMappings,
    applyPreset: applyPreset,
    saveCustomTemplate: saveCustomTemplate,
    loadTemplateById: loadTemplateById,
    deleteSavedTemplate: deleteSavedTemplate,
    useTemplateInTools: useTemplateInTools,
    exportTransformedExcel: exportTransformedExcel,
    addStaticPiecePrompt: addStaticPiecePrompt,
    setLayout: setLayout
  };

})();
