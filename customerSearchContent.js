/**
 * Customer Copy/Paste Handler
 * Manages customer details copy and paste operations
 */

const STORAGE_KEY = 'samsung_customer_data';

// ============================================
// COPY BUTTON - For PopCustomerSearch.jsp
// ============================================

function extractCustomerDetails() {
  const details = {};
  const allText = document.body.innerText;
  
  // Look for common patterns in visible text
  const patterns = {
    'Customer Name': /Customer\s*Name\s*:?\s*([^\n]*)/i,
    'Address': /Address\s*:?\s*([^\n]*)/i,
    'Telephone (Mobile)': /(?:Mobile|Phone|Telephone\s*\(Mobile\))\s*:?\s*(\d+[\d\s\-]*)/i,
    'Telephone (Home)': /(?:Home|Telephone\s*\(Home\))\s*:?\s*(\d+[\d\s\-]*)/i,
    'Telephone (Office)': /(?:Office|Telephone\s*\(Office\))\s*:?\s*(\d+[\d\s\-]*)/i,
    'Customer No': /Customer\s*No\s*:?\s*([^\n]*)/i,
    'E-Mail': /(?:Email|E-Mail)\s*:?\s*([^\n]*)/i
  };
  
  for (const [field, pattern] of Object.entries(patterns)) {
    const match = allText.match(pattern);
    if (match && match[1]) {
      details[field] = match[1].trim();
    }
  }
  
  if (Object.keys(details).length === 0) {
    const inputs = document.querySelectorAll('input[type="text"], textarea');
    inputs.forEach(input => {
      const placeholder = input.placeholder || '';
      const name = input.name || '';
      const value = input.value || '';
      
      if (value.trim()) {
        if (placeholder.toLowerCase().includes('name') || name.toLowerCase().includes('name')) {
          details['Customer Name'] = value.trim();
        }
        if (placeholder.toLowerCase().includes('address') || name.toLowerCase().includes('address')) {
          details['Address'] = value.trim();
        }
        if (placeholder.toLowerCase().includes('phone') || placeholder.toLowerCase().includes('mobile') || 
            name.toLowerCase().includes('phone') || name.toLowerCase().includes('mobile')) {
          details['Telephone (Mobile)'] = value.trim();
        }
        if (placeholder.toLowerCase().includes('email') || name.toLowerCase().includes('email')) {
          details['E-Mail'] = value.trim();
        }
      }
    });
  }
  
  return details;
}

function injectCopyButton() {
  if (document.getElementById('samsung-copy-btn')) return;
  
  const button = document.createElement('button');
  button.id = 'samsung-copy-btn';
  button.innerHTML = '📋 <b>COPY</b>';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 14px 18px;
    background: linear-gradient(135deg, #1a56db 0%, #0f3cc9 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(26, 86, 219, 0.3);
    transition: all 0.3s ease;
    letter-spacing: 0.5px;
  `;
  
  button.onmouseover = () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 20px rgba(26, 86, 219, 0.4)';
  };
  
  button.onmouseout = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(26, 86, 219, 0.3)';
  };
  
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyCustomerDetails();
  });
  
  document.body.appendChild(button);
}

function copyCustomerDetails() {
  const details = extractCustomerDetails();
  
  if (Object.keys(details).length === 0) {
    showNotification('⚠️ No customer details found. Ensure data is loaded.', 'error');
    return;
  }
  
  chrome.storage.local.set(
    { [STORAGE_KEY]: details },
    () => {
      showNotification('✅ Customer details copied to clipboard!', 'success');
      console.log('Copied:', details);
    }
  );
}

// ============================================
// PASTE BUTTON - For New Forms/Popups
// ============================================

function injectPasteButton() {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    if (!data[STORAGE_KEY]) return;
    if (document.getElementById('samsung-paste-btn')) return;
    
    const button = document.createElement('button');
    button.id = 'samsung-paste-btn';
    button.innerHTML = '📥 <b>PASTE</b>';
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 14px 18px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      transition: all 0.3s ease;
      letter-spacing: 0.5px;
    `;
    
    button.onmouseover = () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
    };
    
    button.onmouseout = () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    };
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pasteCustomerDetails(data[STORAGE_KEY]);
    });
    
    document.body.appendChild(button);
  });
}

function pasteCustomerDetails(details) {
  let pastedCount = 0;
  const inputs = document.querySelectorAll('input[type="text"], textarea, input[type="email"], input[type="tel"]');
  
  inputs.forEach(input => {
    const placeholder = input.placeholder || '';
    const name = input.name || '';
    const id = input.id || '';
    const combined = `${placeholder} ${name} ${id}`.toLowerCase();
    
    if (details['Customer Name'] && (combined.includes('name') || combined.includes('customer'))) {
      if (!input.value) {
        input.value = details['Customer Name'];
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pastedCount++;
      }
    }
    
    if (details['Address'] && combined.includes('address')) {
      if (!input.value) {
        input.value = details['Address'];
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pastedCount++;
      }
    }
    
    if (details['Telephone (Mobile)'] && (combined.includes('mobile') || (combined.includes('phone') && combined.includes('mobile')))) {
      if (!input.value) {
        input.value = details['Telephone (Mobile)'];
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pastedCount++;
      }
    }
    
    if (details['Telephone (Home)'] && (combined.includes('home') || combined.includes('telephone'))) {
      if (!input.value) {
        input.value = details['Telephone (Home)'];
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pastedCount++;
      }
    }
    
    if (details['Telephone (Office)'] && combined.includes('office')) {
      if (!input.value) {
        input.value = details['Telephone (Office)'];
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pastedCount++;
      }
    }
    
    if (details['E-Mail'] && combined.includes('email')) {
      if (!input.value) {
        input.value = details['E-Mail'];
        input.dispatchEvent(new Event('change', { bubbles: true }));
        pastedCount++;
      }
    }
  });
  
  if (pastedCount > 0) {
    showNotification(`✅ Pasted ${pastedCount} field(s)!`, 'success');
  } else {
    showNotification('⚠️ No matching fields found. Fill manually.', 'warning');
  }
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 14px 18px;
    background-color: ${colors[type] || colors.info};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 10001;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    animation: slideIn 0.3s ease-in-out;
  `;
  notification.textContent = message;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `;
  if (!document.head.querySelector('style[data-notification]')) {
    style.setAttribute('data-notification', 'true');
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in-out forwards';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================
// INITIALIZE
// ============================================

let isCustomerGhostActive = false;

function checkAndInjectCustomerButtons() {
  if (isCustomerGhostActive) {
    const copyBtn = document.getElementById('samsung-copy-btn');
    if (copyBtn) copyBtn.remove();
    const pasteBtn = document.getElementById('samsung-paste-btn');
    if (pasteBtn) pasteBtn.remove();
    return;
  }
  injectCopyButton();
  injectPasteButton();
}

chrome.storage.local.get(['ghostModeEnabled'], (data) => {
  isCustomerGhostActive = !!data.ghostModeEnabled;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndInjectCustomerButtons);
  } else {
    checkAndInjectCustomerButtons();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, 'ghostModeEnabled')) {
    isCustomerGhostActive = !!changes.ghostModeEnabled.newValue;
    checkAndInjectCustomerButtons();
  }
});

const observer = new MutationObserver(() => {
  checkAndInjectCustomerButtons();
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}

