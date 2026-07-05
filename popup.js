// IndeedHarvest - Popup Script

const GUMROAD_PRODUCT_ID = 'Wu_Q1_gcogy2qS9mCM0LFw=='; // Gumroad Product ID
const DEV_LICENSE_KEYS = ['DEV-UNLOCK-HARVEST', 'TEST-PRO-KEY'];

// State variables
let activeTab = null;
let proUnlocked = false;
let scrapeCheckInterval = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadLicenseState();
  loadSettings();
  checkCurrentTab();
  
  // Wire up event listeners
  document.getElementById('btn-scrape-free').addEventListener('click', () => startScrape(1));
  document.getElementById('btn-scrape-pro').addEventListener('click', () => {
    const pages = parseInt(document.getElementById('max-pages').value) || 1;
    startScrape(pages);
  });
  
  document.getElementById('btn-cancel-scrape').addEventListener('click', cancelScrape);
  
  // Export actions
  document.getElementById('btn-export-csv-free').addEventListener('click', () => triggerExport('csv'));
  document.getElementById('btn-export-csv-pro').addEventListener('click', () => triggerExport('csv'));
  document.getElementById('btn-export-xlsx-pro').addEventListener('click', () => triggerExport('xlsx'));
  document.getElementById('btn-export-json-pro').addEventListener('click', () => triggerExport('json'));
  
  // License actions
  document.getElementById('btn-activate-license').addEventListener('click', activateLicense);
  document.getElementById('btn-deactivate-license').addEventListener('click', deactivateLicense);
  document.getElementById('btn-promo-go-pro').addEventListener('click', () => switchTab('tab-license'));
  document.getElementById('btn-buy-pro-key').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://novastrikes.gumroad.com/l/indeedharvest' });
  });
  
  // Settings checkbox listeners
  const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', saveSettings);
  });
});

// 1. Tab Navigation Routing
function initTabs() {
  const tabButtons = document.querySelectorAll('.nav-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tabs content
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab.id === tabId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Refresh data if history tab opened
  if (tabId === 'tab-history') {
    renderHistory();
  }
}

// 2. Check tab URL and active context
async function checkCurrentTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) return;
    
    activeTab = tabs[0];
    const url = activeTab.url;
    
    // Check if on Indeed
    const isIndeed = /indeed\.(com|co\.uk|com\.pk|ca|com\.au|de|fr|in|nl|es|it)/i.test(new URL(url).hostname);
    
    if (isIndeed) {
      document.getElementById('status-badge').className = 'badge badge-active';
      document.getElementById('status-badge').innerText = 'Indeed Active';
      document.getElementById('state-not-indeed').style.display = 'none';
      document.getElementById('state-active-indeed').style.display = 'block';
      
      // Update DOM count
      chrome.tabs.sendMessage(activeTab.id, { action: 'detectJobs' }, (response) => {
        if (chrome.runtime.lastError) {
          // Script might not be fully loaded/injected yet
          document.getElementById('jobs-detected-count').innerText = '0';
          return;
        }
        if (response && response.count !== undefined) {
          document.getElementById('jobs-detected-count').innerText = response.count;
        }
      });
      
      // Check active scraping status
      monitorScrapeSession();
    } else {
      document.getElementById('status-badge').className = 'badge badge-inactive';
      document.getElementById('status-badge').innerText = 'Inactive';
      document.getElementById('state-not-indeed').style.display = 'block';
      document.getElementById('state-active-indeed').style.display = 'none';
    }
  } catch (e) {
    console.error('IndeedHarvest: Tab check failed', e);
  }
}

// 3. Monitor Scrape Session
function monitorScrapeSession() {
  if (scrapeCheckInterval) clearInterval(scrapeCheckInterval);
  
  const checkStatus = () => {
    chrome.storage.local.get(['scrapeSession'], (result) => {
      const session = result.scrapeSession;
      if (!session) return;
      
      const progressBox = document.getElementById('scraping-progress-box');
      const freeControls = document.getElementById('free-controls');
      const proControls = document.getElementById('pro-controls');
      const exportBox = document.getElementById('export-box');
      const promoBanner = document.getElementById('free-promo-banner');
      
      if (session.active) {
        // Scrape is currently running
        progressBox.style.display = 'block';
        freeControls.style.display = 'none';
        proControls.style.display = 'none';
        exportBox.style.display = 'none';
        promoBanner.style.display = 'none';
        
        document.getElementById('progress-status-msg').innerText = 
          `Scraping page ${session.currentPage}/${session.maxPages}... (${session.scrapedCount} jobs cached)`;
      } else {
        // Scrape completed or idle
        clearInterval(scrapeCheckInterval);
        progressBox.style.display = 'none';
        
        // Show proper controls based on Pro status
        updateUIMode(proUnlocked);
        
        // Check if there are cached results to export
        const jobKeys = Object.keys(session.tempJobs || {});
        if (jobKeys.length > 0) {
          exportBox.style.display = 'block';
          
          let displayCount = jobKeys.length;
          if (!proUnlocked && displayCount > 25) {
            displayCount = 25; // Visual capping indicator
          }
          
          document.getElementById('export-count-label').innerText = `${displayCount} jobs ready for export`;
          
          // Also update the free limit bar
          if (!proUnlocked) {
            const count = Math.min(jobKeys.length, 25);
            document.getElementById('free-scraped-counter').innerText = count;
            document.getElementById('limit-bar-fill').style.width = `${(count / 25) * 100}%`;
          }
        } else {
          exportBox.style.display = 'none';
          
          if (!proUnlocked) {
            document.getElementById('free-scraped-counter').innerText = '0';
            document.getElementById('limit-bar-fill').style.width = '0%';
          }
        }
      }
    });
  };
  
  checkStatus();
  scrapeCheckInterval = setInterval(checkStatus, 500);
}

// 4. Start Scrape Session
function startScrape(maxPages) {
  if (!activeTab) return;
  
  const include = document.getElementById('filter-include').value;
  const exclude = document.getElementById('filter-exclude').value;
  
  const filters = {
    includeKeywords: include,
    excludeKeywords: exclude
  };
  
  chrome.tabs.sendMessage(activeTab.id, {
    action: 'startScrape',
    maxPages: maxPages,
    filters: filters
  }, (response) => {
    if (chrome.runtime.lastError) {
      alert('Please refresh the Indeed page and try again.');
      return;
    }
    
    // Clear display counters and begin UI tracking
    monitorScrapeSession();
  });
}

function cancelScrape() {
  if (!activeTab) return;
  chrome.tabs.sendMessage(activeTab.id, { action: 'cancelScrape' }, () => {
    monitorScrapeSession();
  });
}

// 5. User UI Adjustments based on Pro Status
function updateUIMode(unlocked) {
  proUnlocked = unlocked;
  
  const proBadge = document.getElementById('pro-badge');
  const freeControls = document.getElementById('free-controls');
  const proControls = document.getElementById('pro-controls');
  const freeExports = document.getElementById('free-exports');
  const proExports = document.getElementById('pro-exports');
  const promoBanner = document.getElementById('free-promo-banner');
  
  const licenseUnlockedCard = document.getElementById('license-unlocked-card');
  const licenseLockedCard = document.getElementById('license-locked-card');
  
  const proNavBtn = document.getElementById('nav-license-btn');
  
  if (unlocked) {
    proBadge.style.display = 'inline-block';
    freeControls.style.display = 'none';
    proControls.style.display = 'flex';
    freeExports.style.display = 'none';
    proExports.style.display = 'flex';
    promoBanner.style.display = 'none';
    
    licenseUnlockedCard.style.display = 'flex';
    licenseLockedCard.style.display = 'none';
    
    proNavBtn.innerText = '🔑 Pro Active';
    
    // Unlock and enable all checkbox selectors
    document.querySelectorAll('.pro-gated').forEach(el => {
      el.classList.add('unlocked');
      const input = el.querySelector('input');
      if (input) input.disabled = false;
    });
  } else {
    proBadge.style.display = 'none';
    freeControls.style.display = 'flex';
    proControls.style.display = 'none';
    freeExports.style.display = 'flex';
    proExports.style.display = 'none';
    promoBanner.style.display = 'block';
    
    licenseUnlockedCard.style.display = 'none';
    licenseLockedCard.style.display = 'flex';
    
    proNavBtn.innerText = '🔑 Pro Key';
    
    // Lock Pro checkboxes
    document.querySelectorAll('.pro-gated').forEach(el => {
      el.classList.remove('unlocked');
      const input = el.querySelector('input');
      if (input) {
        input.disabled = true;
        input.checked = false; // Cannot export these on free
      }
    });
  }
}

// 6. Settings Persistence
function loadSettings() {
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) return;
    
    const settings = result.settings;
    const columns = settings.columns || {};
    
    // Wire columns checkboxes
    for (const [col, enabled] of Object.entries(columns)) {
      const cb = document.getElementById(`col-${col}`);
      if (cb) {
        // If it's a pro-gated column and we are in free tier, keep it checked off and disabled
        if (cb.parentNode.classList.contains('pro-gated') && !proUnlocked) {
          cb.checked = false;
        } else {
          cb.checked = enabled;
        }
      }
    }
    
    // Wire keyword filter text inputs
    if (settings.filters) {
      document.getElementById('filter-include').value = settings.filters.includeKeywords || '';
      document.getElementById('filter-exclude').value = settings.filters.excludeKeywords || '';
    }
  });
}

function saveSettings() {
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || { columns: {}, filters: {} };
    
    const checkboxIds = [
      'company', 'location', 'salary', 'date', 'url',
      'description', 'companySize', 'workplaceType', 'applyLink'
    ];
    
    checkboxIds.forEach(id => {
      const cb = document.getElementById(`col-${id}`);
      if (cb) {
        settings.columns[id] = cb.checked;
      }
    });
    
    settings.filters = {
      includeKeywords: document.getElementById('filter-include').value,
      excludeKeywords: document.getElementById('filter-exclude').value
    };
    
    chrome.storage.local.set({ settings: settings });
  });
}

// 7. License Key API Verification (Gumroad Flow)
async function activateLicense() {
  const keyInput = document.getElementById('license-key-input');
  const errorMsg = document.getElementById('license-error-msg');
  const activateBtn = document.getElementById('btn-activate-license');
  
  const licenseKey = keyInput.value.trim();
  
  if (!licenseKey) {
    showError('Please enter a license key.');
    return;
  }
  
  errorMsg.style.display = 'none';
  activateBtn.disabled = true;
  activateBtn.innerText = 'Verifying...';
  
  // Developer Backdoor Bypass Check
  if (DEV_LICENSE_KEYS.includes(licenseKey)) {
    setTimeout(() => {
      unlockProSuccess(licenseKey);
      activateBtn.disabled = false;
      activateBtn.innerText = 'Activate License';
    }, 800);
    return;
  }
  
  // Real Gumroad API check
  try {
    const bodyParams = new URLSearchParams();
    bodyParams.append('product_id', GUMROAD_PRODUCT_ID);
    bodyParams.append('license_key', licenseKey);
    bodyParams.append('increment_uses_count', 'true');
    
    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      body: bodyParams
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      unlockProSuccess(licenseKey);
    } else {
      showError(data.message || 'Invalid license key, please check and try again.');
    }
  } catch (error) {
    showError("Connection error: Couldn't reach Gumroad. Please check your internet connection and try again.");
  } finally {
    activateBtn.disabled = false;
    activateBtn.innerText = 'Activate License';
  }
}

function unlockProSuccess(key) {
  const verifiedAt = new Date().toISOString();
  chrome.storage.local.set({
    proUnlocked: true,
    licenseKey: key,
    licenseVerifiedAt: verifiedAt
  }, () => {
    proUnlocked = true;
    updateUIMode(true);
    document.getElementById('display-license-key').innerText = key.replace(/.(?=.{4})/g, '•');
    loadSettings(); // refresh configs since checkboxes are now active
    alert('IndeedHarvest Pro unlocked successfully! Thank you for your support.');
  });
}

function deactivateLicense() {
  if (confirm('Are you sure you want to deactivate your Pro license?')) {
    chrome.storage.local.set({
      proUnlocked: false,
      licenseKey: '',
      licenseVerifiedAt: ''
    }, () => {
      proUnlocked = false;
      updateUIMode(false);
      loadSettings(); // lock fields
      alert('License deactivated successfully.');
    });
  }
}

function loadLicenseState() {
  chrome.storage.local.get(['proUnlocked', 'licenseKey'], (result) => {
    proUnlocked = !!result.proUnlocked;
    updateUIMode(proUnlocked);
    
    if (proUnlocked && result.licenseKey) {
      document.getElementById('display-license-key').innerText = 
        result.licenseKey.replace(/.(?=.{4})/g, '•');
    }
  });
}

function showError(msg) {
  const errorMsg = document.getElementById('license-error-msg');
  errorMsg.innerText = msg;
  errorMsg.style.display = 'block';
}

// 8. Session History Rendering
function renderHistory() {
  chrome.storage.local.get(['sessionHistory'], (result) => {
    const container = document.getElementById('history-list');
    const history = result.sessionHistory || [];
    
    if (history.length === 0) {
      container.innerHTML = '<div class="empty-history">No sessions recorded yet. Scrape jobs to populate history.</div>';
      return;
    }
    
    container.innerHTML = '';
    
    history.forEach((session, idx) => {
      const card = document.createElement('div');
      card.className = 'history-card';
      
      const dateStr = new Date(session.timestamp).toLocaleString();
      let limitCount = session.jobCount;
      if (!proUnlocked && limitCount > 25) {
        limitCount = 25; // free limit visual cap
      }
      
      card.innerHTML = `
        <div class="history-meta">
          <span class="history-date">📅 ${dateStr}</span>
          <span class="history-count">Count: ${limitCount} jobs</span>
        </div>
        <div class="history-actions" id="history-actions-${idx}">
          <!-- Will render buttons based on tier -->
        </div>
      `;
      
      container.appendChild(card);
      
      const actionsDiv = document.getElementById(`history-actions-${idx}`);
      if (proUnlocked) {
        const btnCsv = document.createElement('button');
        btnCsv.className = 'btn btn-success btn-sm';
        btnCsv.innerText = 'CSV';
        btnCsv.addEventListener('click', () => exportData(session.jobs, 'csv', session.timestamp));
        
        const btnXlsx = document.createElement('button');
        btnXlsx.className = 'btn btn-success btn-sm';
        btnXlsx.innerText = 'XLSX';
        btnXlsx.addEventListener('click', () => exportData(session.jobs, 'xlsx', session.timestamp));
        
        const btnJson = document.createElement('button');
        btnJson.className = 'btn btn-success btn-sm';
        btnJson.innerText = 'JSON';
        btnJson.addEventListener('click', () => exportData(session.jobs, 'json', session.timestamp));
        
        actionsDiv.appendChild(btnCsv);
        actionsDiv.appendChild(btnXlsx);
        actionsDiv.appendChild(btnJson);
      } else {
        const btnCsvFree = document.createElement('button');
        btnCsvFree.className = 'btn btn-success btn-sm btn-full';
        btnCsvFree.innerText = 'Export CSV (Free)';
        btnCsvFree.addEventListener('click', () => exportData(session.jobs, 'csv', session.timestamp));
        
        actionsDiv.appendChild(btnCsvFree);
      }
    });
  });
}

// 9. Exports Execution (CSV, XLSX, JSON)
function triggerExport(format) {
  chrome.storage.local.get(['scrapeSession'], (result) => {
    const session = result.scrapeSession;
    if (!session || !session.tempJobs) {
      alert('No data found to export. Please run a scrape session first.');
      return;
    }
    
    const jobsList = Object.values(session.tempJobs);
    if (jobsList.length === 0) {
      alert('No jobs collected yet.');
      return;
    }
    
    exportData(jobsList, format, new Date().toISOString());
  });
}

function exportData(jobs, format, timestamp) {
  // Deduplicate baseline
  const deduplicatedJobs = [];
  const seenJks = new Set();
  
  for (const job of jobs) {
    if (!seenJks.has(job.jk)) {
      seenJks.add(job.jk);
      deduplicatedJobs.push(job);
    }
  }
  
  // Cap for free tier
  let finalJobsList = deduplicatedJobs;
  if (!proUnlocked) {
    finalJobsList = deduplicatedJobs.slice(0, 25);
  }
  
  // Load column selections
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || { columns: {} };
    const cols = settings.columns || {};
    
    // Set headers mapping
    const headersMap = {
      title: 'Job Title',
      company: 'Company',
      location: 'Location',
      salary: 'Salary',
      date: 'Date Posted',
      url: 'Job URL',
      description: 'Description',
      companySize: 'Company Size',
      workplaceType: 'Workplace Type',
      applyLink: 'Apply Link'
    };
    
    // Determine active fields
    const activeKeys = ['title']; // Title is always exported
    const headers = ['Job Title'];
    
    const optionalKeys = [
      'company', 'location', 'salary', 'date', 'url',
      'description', 'companySize', 'workplaceType', 'applyLink'
    ];
    
    optionalKeys.forEach(key => {
      // For gated columns on free, explicitly override to false
      const isProCol = ['description', 'companySize', 'workplaceType', 'applyLink'].includes(key);
      const isEnabled = cols[key] !== false; // defaults to true if not defined
      
      if (isEnabled && !(isProCol && !proUnlocked)) {
        activeKeys.push(key);
        headers.push(headersMap[key]);
      }
    });
    
    // Format timestamp for filename
    const dateFormatted = new Date(timestamp).toISOString().split('T')[0];
    const filename = `indeed_jobs_${dateFormatted}.${format}`;
    
    // Export execution logic based on format
    if (format === 'csv') {
      const csvContent = generateCSV(finalJobsList, headers, activeKeys);
      downloadBlob(csvContent, filename, 'text/csv;charset=utf-8;');
    } else if (format === 'json') {
      // Keep only selected columns in JSON
      const jsonContent = finalJobsList.map(job => {
        const item = {};
        activeKeys.forEach(k => item[headersMap[k]] = job[k] || '');
        return item;
      });
      downloadBlob(JSON.stringify(jsonContent, null, 2), filename, 'application/json;charset=utf-8;');
    } else if (format === 'xlsx') {
      // XLSX export via SheetJS (XLSX object is loaded globally from lib/xlsx.full.min.js)
      if (typeof XLSX === 'undefined') {
        alert('SheetJS XLSX library is not loaded. Try reloading the extension.');
        return;
      }
      
      const sheetData = finalJobsList.map(job => {
        const row = {};
        activeKeys.forEach(k => {
          row[headersMap[k]] = job[k] || '';
        });
        return row;
      });
      
      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Jobs');
      
      const xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  });
}

function generateCSV(jobs, headers, keys) {
  const rows = [];
  
  // 1. Headers Row
  rows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
  
  // 2. Data Rows
  jobs.forEach(job => {
    const rowValues = keys.map(k => {
      const val = job[k] !== undefined ? job[k] : '';
      return `"${String(val).replace(/"/g, '""').trim()}"`;
    });
    rows.push(rowValues.join(','));
  });
  
  return rows.join('\n');
}

function downloadBlob(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
