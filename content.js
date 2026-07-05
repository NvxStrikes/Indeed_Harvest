// IndeedHarvest - Content Script

const SELECTORS = {
  jobCard: 'div.cardOutline, div.job_seen_beacon, td.resultContent, li.css-5lfssm, [data-jk]',
  jobKeyAttr: 'data-jk',
  title: 'h2.jobTitle a, a[id^="job_"], .jcs-JobDetails-title, h2.jobTitle span[title]',
  company: '[data-testid="company-name"], .companyName, .company_name',
  location: '[data-testid="text-location"], .companyLocation, .location',
  salary: '[data-testid="attribute_snippet_only"], .salary-snippet-container, .metadata.salary-snippet-container, .salaryText, .salary-snippet',
  date: 'span.date, .myJobsState, td.underTitle, .date',
  nextButton: 'a[data-testid="pagination-page-next"], a[aria-label="Next Page"], a[aria-label="Next"]'
};

// Log init
console.log('IndeedHarvest content script loaded.');

// Automatically resume active session on page load
chrome.storage.local.get(['scrapeSession', 'proUnlocked'], (result) => {
  const session = result.scrapeSession;
  if (session && session.active) {
    console.log('IndeedHarvest: Resuming active scrape session, page:', session.currentPage);
    resumeScrapeSession(session, !!result.proUnlocked);
  }
});

// Message listener for popup requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'detectJobs') {
    const jobs = extractJobsOnPage();
    sendResponse({ count: jobs.length });
  } else if (message.action === 'startScrape') {
    const maxPages = message.maxPages || 1;
    const filters = message.filters || { includeKeywords: '', excludeKeywords: '' };
    
    // Clear and start a fresh session
    const session = {
      active: true,
      maxPages: maxPages,
      currentPage: 1,
      scrapedCount: 0,
      tempJobs: {}, // jk -> job object
      filters: filters
    };
    
    chrome.storage.local.set({ scrapeSession: session }, () => {
      chrome.storage.local.get('proUnlocked', (res) => {
        resumeScrapeSession(session, !!res.proUnlocked);
      });
    });
    
    sendResponse({ status: 'started' });
  } else if (message.action === 'cancelScrape') {
    chrome.storage.local.get('scrapeSession', (result) => {
      if (result.scrapeSession) {
        const session = result.scrapeSession;
        session.active = false;
        chrome.storage.local.set({ scrapeSession: session }, () => {
          console.log('IndeedHarvest: Scrape session cancelled by user.');
        });
      }
    });
    sendResponse({ status: 'cancelled' });
  }
  return true;
});

// Extract jobs visible on current page
function extractJobsOnPage() {
  const elements = document.querySelectorAll('[data-jk]');
  const jobs = [];
  const processedJks = new Set();
  
  for (const el of elements) {
    const jk = el.getAttribute('data-jk');
    if (!jk || processedJks.has(jk)) continue;
    
    // Skip known placeholders/templates
    if (jk === 'fedcba9876543210' || jk.toLowerCase().includes('placeholder')) continue;
    
    // Find the enclosing card container
    let container = el;
    if (!el.classList.contains('cardOutline') && !el.querySelector('[data-testid="company-name"]')) {
      container = el.closest('div.cardOutline, div.job_seen_beacon, td.resultContent, li') || el;
    }
    
    const job = extractJobFromCard(container, jk);
    if (job) {
      // Validate that it is not an empty skeleton card loader
      if (!job.title && !job.company) {
        console.log('IndeedHarvest: Skipping empty skeleton card for jk:', jk);
        continue;
      }
      jobs.push(job);
      processedJks.add(jk);
    }
  }
  
  return jobs;
}

// Defensive fallback date extraction
function extractDateDefensively(cardEl) {
  const selectors = ['span.date', '[data-testid="myJobsState"]', '.myJobsState', 'span[class*="date"]', '.date', 'td.underTitle'];
  for (const sel of selectors) {
    const el = cardEl.querySelector(sel);
    if (el && el.innerText.trim()) {
      return el.innerText.replace(/Employer|Active|Posted/gi, '').trim();
    }
  }
  
  // Fallback element keyword scan
  const elements = cardEl.querySelectorAll('span, div');
  for (const el of elements) {
    if (el.children.length === 0) { // Leaf node
      const text = el.innerText.trim();
      if (/posted|day|today|yesterday|active/i.test(text)) {
        if (/\d+\+?\s+day/i.test(text) || /just\s+posted/i.test(text) || /today/i.test(text) || /yesterday/i.test(text) || /active\s+\d+/i.test(text) || /posted\s+\d+/i.test(text)) {
          return text.replace(/Employer|Active|Posted/gi, '').trim();
        }
      }
    }
  }
  return '';
}

// Workplace badge / text extractor
function extractWorkplaceType(cardEl) {
  const badgeEl = cardEl.querySelector('span[class*="workplace"], div[class*="workplace"], [data-testid="workplace-badge"], .workplaceBadge, .workplace-type');
  if (badgeEl) {
    const text = badgeEl.innerText.trim().toLowerCase();
    if (text.includes('remote')) return 'Remote';
    if (text.includes('hybrid')) return 'Hybrid';
    if (text.includes('on-site') || text.includes('onsite') || text.includes('in-person') || text.includes('in person') || text.includes('in-office') || text.includes('in office')) return 'On-site';
  }
  
  const locationEl = cardEl.querySelector('[data-testid="text-location"], .companyLocation, .location');
  if (locationEl) {
    const locText = locationEl.innerText.trim().toLowerCase();
    if (locText.includes('hybrid')) return 'Hybrid';
    if (locText.includes('remote')) return 'Remote';
  }
  return ''; // Leave empty if not explicitly declared on card
}

// Extract fields from a single job card container
function extractJobFromCard(cardEl, jk) {
  try {
    // 1. Title
    const titleEl = cardEl.querySelector(SELECTORS.title);
    let title = titleEl ? titleEl.innerText.trim() : '';
    if (!title && titleEl) {
      title = titleEl.getAttribute('title') || '';
    }
    
    // 2. Company
    const companyEl = cardEl.querySelector(SELECTORS.company);
    const company = companyEl ? companyEl.innerText.trim() : '';
    
    // 3. Location
    const locationEl = cardEl.querySelector(SELECTORS.location);
    const location = locationEl ? locationEl.innerText.trim() : '';
    
    // 4. Salary
    const salaryEl = cardEl.querySelector(SELECTORS.salary);
    const salary = salaryEl ? salaryEl.innerText.trim() : '';
    
    // 5. Date (defensive scanning fallback)
    const date = extractDateDefensively(cardEl);
    
    // 6. Direct Link URL
    const url = `${window.location.origin}/viewjob?jk=${jk}`;
    
    // 7. Workplace badge (Remote/Hybrid/On-site)
    const workplaceType = extractWorkplaceType(cardEl);
    
    return {
      jk,
      title,
      company,
      location,
      salary,
      date,
      url,
      workplaceType
    };
  } catch (e) {
    console.error('IndeedHarvest: Failed to parse card for jk:', jk, e);
    return null;
  }
}

// Scrape descriptions and apply links (Pro features)
async function scrapeDetailsForJobs(jobs, proUnlocked) {
  if (!proUnlocked) return jobs;
  
  const result = await chrome.storage.local.get('settings');
  const cols = result.settings?.columns || {};
  const needsProDetails = cols.description || cols.companySize || cols.workplaceType || cols.applyLink;
  
  if (!needsProDetails) return jobs;
  
  console.log('IndeedHarvest: Scraping detailed fields for', jobs.length, 'jobs...');
  
  for (let i = 0; i < jobs.length; i++) {
    // Check if session was cancelled mid-scrape
    const currentSession = await chrome.storage.local.get('scrapeSession');
    if (!currentSession.scrapeSession?.active) {
      console.log('IndeedHarvest: Scrape cancelled mid-extraction.');
      break;
    }
    
    const job = jobs[i];
    console.log(`IndeedHarvest: Fetching details ${i + 1}/${jobs.length}: ${job.title}`);
    
    const details = await fetchDescriptionAndApplyLink(job.jk);
    
    job.description = details.description;
    job.companySize = details.companySize;
    if (details.workplaceType) {
      job.workplaceType = details.workplaceType; // override card label if page details are more specific
    }
    job.applyLink = details.applyLink;
    
    // Delay/throttle: 600ms - 1000ms to mimic organic scrolling/reading
    await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
  }
  
  return jobs;
}

// Extract company size from detail page
function extractCompanySizeDefensively(doc) {
  const selectors = ['.js-JobMetadataHeader-item', '.jobsearch-JobDescriptionSection-sectionItem', '.jobsearch-CompanyInfoContainer', '[class*="companySize"]'];
  for (const sel of selectors) {
    const elements = doc.querySelectorAll(sel);
    for (const el of elements) {
      const text = el.innerText.trim();
      if (/employees/i.test(text) || /company size/i.test(text)) {
        return text.replace(/Employees|Company size|Size/gi, '').trim();
      }
    }
  }
  
  // Scan leaf nodes
  const leafNodes = doc.querySelectorAll('div, span, li, td');
  for (const el of leafNodes) {
    if (el.children.length === 0) {
      const text = el.innerText.trim();
      if (/employees/i.test(text) && /\d+/.test(text)) {
        return text.replace(/Employees/gi, '').trim();
      }
      if (/company size/i.test(text) && /\d+/.test(text)) {
        return text.replace(/Company size|Size/gi, '').replace(/^[:\s]+/g, '').trim();
      }
    }
  }
  return '';
}

// Extract workplace type from details page
function extractWorkplaceTypeFromDetail(doc) {
  const selectors = [
    'span[class*="workplace"]',
    'div[class*="workplace"]',
    '[data-testid="workplace-badge"]',
    '.workplaceBadge',
    '.jobsearch-JobMetadataHeader-item',
    '.jobsearch-JobDescriptionSection-sectionItem'
  ];
  
  for (const sel of selectors) {
    const elements = doc.querySelectorAll(sel);
    for (const el of elements) {
      const text = el.innerText.trim().toLowerCase();
      if (text.includes('remote')) return 'Remote';
      if (text.includes('hybrid')) return 'Hybrid';
      if (text.includes('on-site') || text.includes('onsite') || text.includes('in-office') || text.includes('in office') || text.includes('in-person')) return 'On-site';
    }
  }
  
  // Strict description text matches
  const descEl = doc.querySelector('#jobDescriptionText') || doc.querySelector('.jobsearch-JobComponent-description');
  if (descEl) {
    const descText = descEl.innerText.trim().toLowerCase();
    if (/work\s+location:\s*remote|100%\s*remote|fully\s*remote/i.test(descText)) {
      return 'Remote';
    }
    if (/work\s+location:\s*hybrid|hybrid\s*schedule|hybrid\s*remote/i.test(descText)) {
      return 'Hybrid';
    }
    if (/work\s+location:\s*in\s*person|in-office|in\s*office|work\s+location:\s*on-site/i.test(descText)) {
      return 'On-site';
    }
  }
  return '';
}

// Extract outbound application link
function extractApplyLink(doc, jobUrl) {
  const selectors = [
    '#applyButtonLinkContainer a',
    'a[data-testid="indeed-apply-button"]',
    '#indeedApplyButton',
    '.jobsearch-CallToActionButton a',
    'a[href*="clk"]',
    'a[href*="applystart"]'
  ];
  
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && el.href) {
      return el.href;
    }
  }
  
  // Anchor scan
  const anchors = doc.querySelectorAll('a');
  for (const a of anchors) {
    const text = a.innerText.trim().toLowerCase();
    if (text.includes('apply on company') || text.includes('apply now') || text.includes('go to application')) {
      if (a.href) return a.href;
    }
  }
  return jobUrl;
}

// Same-origin background fetch for job details page
async function fetchDescriptionAndApplyLink(jk) {
  const result = { description: '', companySize: '', workplaceType: '', applyLink: '' };
  try {
    const url = `${window.location.origin}/viewjob?jk=${jk}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const htmlText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    // 1. Description
    const descEl = doc.querySelector('#jobDescriptionText') || doc.querySelector('.jobsearch-JobComponent-description');
    result.description = descEl ? descEl.innerText.trim() : '';
    
    // 2. Company size
    result.companySize = extractCompanySizeDefensively(doc);
    
    // 3. Workplace badges (Remote/Hybrid/On-site)
    result.workplaceType = extractWorkplaceTypeFromDetail(doc);
    
    // 4. Direct Apply Link
    result.applyLink = extractApplyLink(doc, url);
  } catch (e) {
    console.error('IndeedHarvest: Error details fetch for jk', jk, e);
  }
  return result;
}

// Primary execution coordinator
async function resumeScrapeSession(session, proUnlocked) {
  // 1. Verify session active
  if (!session.active) return;
  
  console.log(`IndeedHarvest: Starting scraping for page ${session.currentPage}`);
  
  // 2. Extract job cards from current page
  let jobs = extractJobsOnPage();
  
  // 3. Filter job cards based on keywords (Pro Feature)
  if (proUnlocked && session.filters) {
    jobs = applyKeywordFilters(jobs, session.filters);
  }
  
  // 4. Fetch details (Pro Feature - optional but runs if proUnlocked)
  jobs = await scrapeDetailsForJobs(jobs, proUnlocked);
  
  // 5. Read existing temp jobs, merge, and save
  chrome.storage.local.get('scrapeSession', (result) => {
    const currentSession = result.scrapeSession;
    if (!currentSession || !currentSession.active) return; // session cancelled while details loaded
    
    // Merge new jobs into tempJobs
    jobs.forEach(job => {
      currentSession.tempJobs[job.jk] = job;
    });
    
    currentSession.scrapedCount = Object.keys(currentSession.tempJobs).length;
    
    chrome.storage.local.set({ scrapeSession: currentSession }, () => {
      // Proceed to next page or finish
      if (currentSession.currentPage < currentSession.maxPages) {
        goToNextPage(currentSession, proUnlocked);
      } else {
        finalizeSession(currentSession);
      }
    });
  });
}

// Click next and wait for navigation
function goToNextPage(session, proUnlocked) {
  const nextButton = document.querySelector(SELECTORS.nextButton);
  if (nextButton) {
    const oldFirstJk = getFirstJobJk();
    const oldUrl = window.location.href;
    
    session.currentPage += 1;
    chrome.storage.local.set({ scrapeSession: session }, () => {
      console.log('IndeedHarvest: Scroll and click next...');
      nextButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setTimeout(() => {
        nextButton.click();
        
        // Wait for page transition (either SPA or full load)
        let checks = 0;
        const checkInterval = setInterval(() => {
          checks++;
          const newFirstJk = getFirstJobJk();
          const newUrl = window.location.href;
          
          // Resume if first job changed (SPA navigation), URL changed, or timeout reached (10s)
          if ((newFirstJk && newFirstJk !== oldFirstJk) || newUrl !== oldUrl || checks > 20) {
            clearInterval(checkInterval);
            if (checks <= 20) {
              console.log('IndeedHarvest: SPA state transition detected. Resuming scrape...');
              chrome.storage.local.get('scrapeSession', (res) => {
                if (res.scrapeSession && res.scrapeSession.active) {
                  resumeScrapeSession(res.scrapeSession, proUnlocked);
                }
              });
            }
          }
        }, 500);
      }, 800);
    });
  } else {
    console.log('IndeedHarvest: No Next button found. Finalizing.');
    finalizeSession(session);
  }
}

// Finish scrape and commit to history
function finalizeSession(session) {
  session.active = false;
  
  const jobsList = Object.values(session.tempJobs);
  
  chrome.storage.local.get('sessionHistory', (res) => {
    let history = res.sessionHistory || [];
    
    // Add current session details to local history cache (max 5 sessions cached)
    const newSession = {
      timestamp: new Date().toISOString(),
      jobCount: jobsList.length,
      jobs: jobsList
    };
    
    history.unshift(newSession);
    if (history.length > 5) {
      history = history.slice(0, 5);
    }
    
    chrome.storage.local.set({ 
      scrapeSession: session,
      sessionHistory: history
    }, () => {
      console.log('IndeedHarvest: Scrape session finalized. Total jobs:', jobsList.length);
    });
  });
}

// Get the first jk on the page for change tracking
function getFirstJobJk() {
  const firstCard = document.querySelector('[data-jk]');
  return firstCard ? firstCard.getAttribute('data-jk') : null;
}

// Apply keyword includes/excludes on titles/descriptions (Pro Feature)
function applyKeywordFilters(jobs, filters) {
  const include = (filters.includeKeywords || '').toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
  const exclude = (filters.excludeKeywords || '').toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
  
  if (include.length === 0 && exclude.length === 0) return jobs;
  
  return jobs.filter(job => {
    const textToSearch = `${job.title} ${job.company} ${job.location} ${job.description || ''}`.toLowerCase();
    
    // Check excludes
    if (exclude.some(keyword => textToSearch.includes(keyword))) {
      return false;
    }
    
    // Check includes
    if (include.length > 0) {
      return include.some(keyword => textToSearch.includes(keyword));
    }
    
    return true;
  });
}
