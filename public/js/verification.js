// ========================================
// Savoraapp Verification System
// Handles Email and SMS verification via API
// ========================================

// Global API Configuration - reads from config.js if available
window.API_BASE_URL = (window.SAVORA_CONFIG && window.SAVORA_CONFIG.API_BASE) || 'https://savoraapp-api.de262f98ef47a3a6c986661d98a0c217.workers.dev';

(function() {
  'use strict';
  
  // XSS Protection: Escape HTML entities in user input
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Use global API_BASE_URL
  var API_BASE_URL = window.API_BASE_URL || 'https://savoraapp-api.de262f98ef47a3a6c986661d98a0c217.workers.dev';
  
  
  // State — default to email since SMS tabs are hidden in UI
  let currentVerificationType = 'email';
  let currentIdentifier = '';
  let isCodeSent = false;
  let countdownInterval = null;
  let apiHealthy = true;

  // API Health Check
  async function checkApiHealth() {
    try {
      var response = await fetch(API_BASE_URL + '/api/health', { method: 'GET', mode: 'cors' });
      if (response.ok) {
        apiHealthy = true;
      } else {
        apiHealthy = false;
      }
    } catch(err) {
      apiHealthy = false;
    }
  }
  
  // Run health check on load
  checkApiHealth();

  // DOM Elements
  const signupForm = document.getElementById('signupForm');
  const smsTab = document.getElementById('smsTab');
  const emailTab = document.getElementById('emailTab');
  const phoneInput = document.getElementById('phone');
  const emailInput = document.getElementById('email');
  const formTabs = document.querySelectorAll('.form-tab');

  // Initialize
  function init() {
    if (!signupForm) {
      console.error('[Verification] signupForm NOT FOUND!');
      return;
    }
    
    // Make sure email tab is visible (since tabs are hidden in UI)
    if (smsTab) smsTab.classList.add('hidden');
    if (emailTab) emailTab.classList.remove('hidden');
    
    setupTabs();
    setupFormSubmit();
  }

  // Setup tab switching
  function setupTabs() {
    formTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        switchTab(tabName);
      });
    });
  }

  // Switch between SMS and Email tabs
  function switchTab(tabName) {
    currentVerificationType = tabName;
    
    // Update tab buttons
    formTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Show/hide content
    if (tabName === 'sms') {
      smsTab.classList.remove('hidden');
      emailTab.classList.add('hidden');
    } else {
      smsTab.classList.add('hidden');
      emailTab.classList.remove('hidden');
    }
    
    // Reset form state
    resetVerificationState();
  }

  // Reset verification state
  function resetVerificationState() {
    isCodeSent = false;
    currentIdentifier = '';
    clearInterval(countdownInterval);
    
    // Remove verification UI if exists
    const existingVerify = document.getElementById('verificationSection');
    if (existingVerify) {
      existingVerify.remove();
    }
    
    // Show original submit button
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = currentVerificationType === 'sms' 
        ? 'Dërgo Kodin me SMS' 
        : 'Dërgo Linkun';
    }
  }

  // Setup form submission
  function setupFormSubmit() {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!isCodeSent) {
        // Step 1: Send verification code
        await sendVerificationCode();
      } else {
        // Step 2: Verify the code
        await verifyCode();
      }
    });
  }

  // Get full phone number with prefix
  function getFullPhoneNumber() {
    const prefix = document.querySelector('.phone-prefix')?.value || '+355';
    const phone = phoneInput?.value?.trim().replace(/\s/g, '');
    if (!phone) return null;
    return prefix + phone;
  }

  // Get email
  function getEmail() {
    return emailInput?.value?.trim();
  }

  // Validate email
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Loading state helpers
  function setLoading(element, text) {
    if (!element) {
      return;
    }
    element.disabled = true;
    element.dataset.originalText = element.textContent || element.innerText;
    element.classList.add('btn-loading');
    // Show spinner text inside button
    element.textContent = text || 'Loading...';
  }

  function clearLoading(element) {
    if (!element) {
      return;
    }
    element.disabled = false;
    element.classList.remove('btn-loading');
    if (element.dataset.originalText) {
      element.textContent = element.dataset.originalText;
      delete element.dataset.originalText;
    }
  }

  // Send verification code
  async function sendVerificationCode() {
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    
    // Get identifier based on type
    if (currentVerificationType === 'sms') {
      currentIdentifier = getFullPhoneNumber();
      if (!currentIdentifier) {
        showError('Ju lutem shkruani numrin e telefonit');
        return;
      }
    } else {
      currentIdentifier = getEmail();
      if (!currentIdentifier || !isValidEmail(currentIdentifier)) {
        showError('Ju lutem shkruani një email të vlefshëm');
        return;
      }
    }

    // Show loading state - disables button, shows spinner via CSS
    setLoading(submitBtn, 'Duke dërguar...');

    try {
      const response = await fetch(API_BASE_URL + '/api/send-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: currentVerificationType,
          identifier: currentIdentifier
        })
      });
      

      let data;
      try {
        data = await response.json();
      } catch (e) {
        showError('Përgjigje e pavlefshme nga serveri (status ' + response.status + ')');
        clearLoading(submitBtn);
        return;
      }

      if (data.success) {
        isCodeSent = true;
        showVerificationInput();
        startCountdown();
        showSuccess('✅ Kodi i verifikimit u dërgua! Kontrolloni ' + 
          (currentVerificationType === 'sms' ? 'telefonin tuaj' : 'email-in tuaj') + '. KODI EKZISTON PËR 5 MINUTA.');
      } else {
        // Show specific error from server (rate limit, invalid, etc.)
        var errorMsg = data.error || 'Gabim gjatë dërgimit të kodit';
        // Add warning icon for rate limit errors
        if (response.status === 429 || (errorMsg && errorMsg.toLowerCase().indexOf('maximum') !== -1)) {
          errorMsg = '⚠️ ' + errorMsg;
        }
        showError(errorMsg);
        clearLoading(submitBtn);
      }
    } catch (error) {
      console.error('[Verification] Fetch error:', error);
      showError('❌ API offline ose gabim në lidhje. Ju lutem provoni përsëri më vonë. (' + error.message + ')');
      clearLoading(submitBtn);
    }
  }

  // Show verification code input
  function showVerificationInput() {
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    
    // Create verification section
    const verifySection = document.createElement('div');
    verifySection.id = 'verificationSection';
    verifySection.className = 'verification-section';
    verifySection.innerHTML = `
      <div class="form-group">
        <label for="verificationCode">Kodi i Verifikimit</label>
        <input 
          type="text" 
          id="verificationCode" 
          placeholder="Shkruani kodin 6-shifror" 
          class="form-input verification-input"
          maxlength="6"
          autocomplete="one-time-code"
        >
        <span class="hint">Kodi është dërguar në ${escapeHtml(currentIdentifier)}</span>
      </div>
      <div class="verification-actions">
        <button type="submit" id="verifyCodeBtn" class="btn btn-primary btn-full">Verifiko Kodin</button>
        <button type="button" class="btn btn-link resend-btn" id="resendBtn" disabled>
          Ridërgo kodin (<span id="countdown">60</span>s)
        </button>
      </div>
    `;

    // Insert after the current tab content
    const activeTab = currentVerificationType === 'sms' ? smsTab : emailTab;
    activeTab.appendChild(verifySection);

    // Hide original submit button
    submitBtn.style.display = 'none';

    // Focus on verification input
    setTimeout(() => {
      document.getElementById('verificationCode')?.focus();
    }, 100);

    // Setup resend button
    const resendBtn = document.getElementById('resendBtn');
    resendBtn?.addEventListener('click', async () => {
      setLoading(resendBtn, 'Duke ridërguar...');
      resetVerificationState();
      await sendVerificationCode();
    });
  }

  // Start countdown for resend
  function startCountdown() {
    let seconds = 60;
    const countdownEl = document.getElementById('countdown');
    const resendBtn = document.getElementById('resendBtn');
    
    if (!countdownEl || !resendBtn) return;

    clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
      seconds--;
      countdownEl.textContent = seconds;
      
      if (seconds <= 0) {
        clearInterval(countdownInterval);
        resendBtn.disabled = false;
        resendBtn.textContent = 'Ridërgo kodin';
      }
    }, 1000);
  }

  // Verify the code
  async function verifyCode() {
    const codeInput = document.getElementById('verificationCode');
    const code = codeInput?.value?.trim();
    
    if (!code || code.length !== 6) {
      showError('Ju lutem shkruani kodin 6-shifror');
      return;
    }

    // Find the verify button — try multiple selectors
    var submitBtn = document.getElementById('verifyCodeBtn') || 
                    signupForm.querySelector('#verificationSection button[type="submit"]') ||
                    signupForm.querySelector('.verification-actions button');
    setLoading(submitBtn, 'Duke verifikuar...');

    try {
      const response = await fetch(API_BASE_URL + '/api/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: currentVerificationType,
          identifier: currentIdentifier,
          code: code
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error('[Verification] JSON parse error:', e);
        showError('Përgjigje e pavlefshme nga serveri');
        clearLoading(submitBtn);
        if (submitBtn) submitBtn.textContent = 'Verifiko Kodin';
        return;
      }

      if (data.success) {
        showSuccess('✅ Verifikimi u krye me sukses! Ju tani jeni pjesë e savoraapp. Email-i juaj u verifikua.');
        if (submitBtn) {
          submitBtn.textContent = 'Verifikuar!';
          submitBtn.classList.add('btn-success');
        }
        // Hide verification section
        setTimeout(function() {
          var vs = document.getElementById('verificationSection');
          if (vs) vs.style.display = 'none';
        }, 2000);
      } else {
        showError(data.error || 'Kodi i pavlefshëm');
        clearLoading(submitBtn);
        if (submitBtn) submitBtn.textContent = 'Verifiko Kodin';
      }
    } catch (error) {
      console.error('[Verification] Verify error:', error);
      showError('❌ API offline ose gabim në lidhje. Ju lutem provoni përsëri më vonë.');
      clearLoading(submitBtn);
      if (submitBtn) submitBtn.textContent = 'Verifiko Kodin';
    }
  }

  // Reset submit button
  function resetSubmitButton() {
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      clearLoading(submitBtn);
      submitBtn.textContent = currentVerificationType === 'sms' 
        ? 'Dërgo Kodin me SMS' 
        : 'Dërgo Linkun';
    }
  }

  // Show error message
  function showError(message) {
    // Handle object errors
    if (typeof message === 'object') {
      message = message.error || message.message || JSON.stringify(message);
    }
    
    // Remove existing messages
    removeMessages();
    
    const error = document.createElement('div');
    error.className = 'form-message error';
    error.textContent = message || 'Ka ndodhur një gabim. Ju lutem provoni përsëri.';
    signupForm.insertBefore(error, signupForm.firstChild);
    
    setTimeout(removeMessages, 5000);
  }

  // Show success message
  function showSuccess(message) {
    removeMessages();
    
    const success = document.createElement('div');
    success.className = 'form-message success';
    success.textContent = message;
    signupForm.insertBefore(success, signupForm.firstChild);
    
    setTimeout(removeMessages, 5000);
  }

  // Remove messages
  function removeMessages() {
    signupForm.querySelectorAll('.form-message').forEach(function(el) { el.remove(); });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
