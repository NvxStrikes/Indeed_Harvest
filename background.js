// IndeedHarvest - Service Worker (Background Script)

chrome.runtime.onInstalled.addListener(() => {
  // Initialize local storage configurations
  chrome.storage.local.get([
    'proUnlocked', 
    'licenseKey', 
    'savedProfiles', 
    'sessionHistory', 
    'scrapeSession', 
    'settings'
  ], (result) => {
    const updates = {};
    if (result.proUnlocked === undefined) updates.proUnlocked = false;
    if (result.licenseKey === undefined) updates.licenseKey = '';
    if (result.savedProfiles === undefined) updates.savedProfiles = [];
    if (result.sessionHistory === undefined) updates.sessionHistory = [];
    if (result.scrapeSession === undefined) {
      updates.scrapeSession = {
        active: false,
        maxPages: 1,
        currentPage: 1,
        scrapedCount: 0,
        tempJobs: {} // jk -> job details map
      };
    }
    if (result.settings === undefined) {
      updates.settings = {
        columns: {
          title: true,
          company: true,
          location: true,
          salary: true,
          date: true,
          url: true,
          // Pro fields
          description: true,
          companySize: true,
          workplaceType: true,
          applyLink: true
        },
        filters: {
          includeKeywords: '',
          excludeKeywords: ''
        }
      };
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        console.log('IndeedHarvest: Local storage initialized.', updates);
      });
    }
  });
  
  console.log('IndeedHarvest background worker loaded.');
});

// Listener for messages between content script and popup (or for background tasks if needed)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'verifyLicense') {
    const url = 'https://api.gumroad.com/v2/licenses/verify';
    
    const bodyParams = new URLSearchParams();
    bodyParams.append('product_permalink', message.productPermalink || 'indeedharvest');
    bodyParams.append('license_key', message.licenseKey);
    bodyParams.append('increment_uses_count', 'true');
    
    fetch(url, {
      method: 'POST',
      body: bodyParams
    })
    .then(response => response.json())
    .then(data => {
      sendResponse({ success: true, data: data });
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  }
});
