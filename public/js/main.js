// ========================================
// Savoraapp V26 - Main JavaScript
// All 6 improvements: Design, Text, Mobile, Conversion, New Sections, Performance
// ========================================

(function() {
  'use strict';

  // ========================================
  // Partner Mode Toggle
  // ========================================
  let currentMode = localStorage.getItem('savoraapp-mode') || 'consumer';
  const body = document.body;
  const partnerModeBtn = document.getElementById('partnerModeBtn');
  
  function setMode(mode) {
    currentMode = mode;
    body.setAttribute('data-mode', mode);
    localStorage.setItem('savoraapp-mode', mode);
    updateModeTranslations();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // Expose setMode globally for use by inline scripts
  window.setMode = setMode;
  
  function toggleMode() {
    const newMode = currentMode === 'consumer' ? 'partner' : 'consumer';
    
    // If switching to partner mode, check login first
    if (newMode === 'partner') {
      var partnerToken = localStorage.getItem('partner_token');
      if (!partnerToken) {
        // Not logged in - redirect to partner login page
        window.location.href = 'partner.html';
        return;
      }
    }
    
    setMode(newMode);
  }
  
  setMode(currentMode);
  
  if (partnerModeBtn) {
    partnerModeBtn.addEventListener('click', toggleMode);
  }

  // ========================================
  // i18n - Internationalization
  // ========================================
  let currentLang = localStorage.getItem('savoraapp-lang') || 'sq';
  
  function loadTranslations() {
    if (typeof translations === 'undefined') {
      return;
    }
    
    const t = translations[currentLang];
    if (!t) {
      return;
    }
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) {
        if (key === 'termsText') {
          const termsLink = t.termsLink;
          const privacyLink = t.privacyLink;
          el.innerHTML = t[key]
            .replace('{terms}', `<a href="#">${termsLink}</a>`)
            .replace('{privacy}', `<a href="#">${privacyLink}</a>`);
        } else {
          el.textContent = t[key];
        }
      }
    });
    
    document.documentElement.lang = currentLang;
    updateLangButton();
    updateModeTranslations();
  }
  
  function updateModeTranslations() {
    if (typeof translations === 'undefined') return;
    
    const t = translations[currentLang];
    if (!t) return;
    
    const partnerModeBtn = document.getElementById('partnerModeBtn');
    if (partnerModeBtn) {
      const btnText = partnerModeBtn.querySelector('span[data-i18n]');
      if (btnText) {
        const key = currentMode === 'consumer' ? 'partnerModeBtn' : 'consumerModeBtn';
        if (t[key]) {
          btnText.textContent = t[key];
          btnText.setAttribute('data-i18n', key);
        }
      }
    }
  }
  
  function updateLangButton() {
    const flagIso = {
      sq: 'al', en: 'gb', nl: 'nl', de: 'de',
      it: 'it', gr: 'gr', fr: 'fr', es: 'es', tr: 'tr', ar: 'sa'
    };
    
    const codes = {
      sq: 'AL', en: 'EN', nl: 'NL', de: 'DE',
      it: 'IT', gr: 'GR', fr: 'FR', es: 'ES', tr: 'TR', ar: 'AR'
    };
    
    const langBtn = document.getElementById('langBtn');
    if (langBtn) {
      const flagImg = langBtn.querySelector('.lang-flag-img');
      if (flagImg) flagImg.src = 'https://flagcdn.com/w40/' + flagIso[currentLang] + '.png';
      langBtn.querySelector('.lang-code').textContent = codes[currentLang];
    }
    
    const langBtnPartner = document.getElementById('langBtnPartner');
    if (langBtnPartner) {
      const flagImgP = langBtnPartner.querySelector('.lang-flag-img');
      if (flagImgP) flagImgP.src = 'https://flagcdn.com/w40/' + flagIso[currentLang] + '.png';
      langBtnPartner.querySelector('.lang-code').textContent = codes[currentLang];
    }
    
    document.querySelectorAll('.lang-option').forEach(option => {
      option.classList.toggle('active', option.dataset.lang === currentLang);
    });
  }
  
  // ========================================
  // Language Switcher — Dropdown Toggle Only
  // Translation logic is handled by inline i18n in index.html
  // ========================================
  const langBtn = document.getElementById('langBtn');
  const langDropdown = document.getElementById('langDropdown');
  const langBtnPartner = document.getElementById('langBtnPartner');
  const langDropdownPartner = document.getElementById('langDropdownPartner');
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', function(e) {
    // Only close if click is NOT on a language button
    if (!e.target.closest('.lang-btn')) {
      if (langDropdown) langDropdown.classList.remove('show');
      if (langDropdownPartner) langDropdownPartner.classList.remove('show');
    }
  });
  
  // Sync main.js currentLang with inline i18n
  document.addEventListener('DOMContentLoaded', function() {
    var savedLang = localStorage.getItem('savoraapp-lang') || localStorage.getItem('savora_language') || 'sq';
    // Use window.translations (set by inline i18n in index.html)
    var trans = window.translations || (typeof translations !== 'undefined' ? translations : null);
    if (savedLang && trans && trans[savedLang]) {
      currentLang = savedLang;
    }
    updateLangButton();
  });

  // ========================================
  // Mobile Menu Toggle
  // ========================================
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');

  if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      mobileMenuBtn.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        mobileMenuBtn.classList.remove('active');
      });
    });
  }

  // ========================================
  // Navbar Scroll Effect
  // ========================================
  const nav = document.getElementById('nav');
  
  function handleNavScroll() {
    if (window.scrollY > 50) {
      nav.classList.add('nav-scrolled');
    } else {
      nav.classList.remove('nav-scrolled');
    }
  }

  window.addEventListener('scroll', handleNavScroll, { passive: true });

  // ========================================
  // Smooth Scroll for Anchor Links
  // ========================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        const navHeight = nav ? nav.offsetHeight : 0;
        const targetPosition = targetElement.offsetTop - navHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // ========================================
  // Form Tabs (SMS/Email)
  // ========================================
  const formTabs = document.querySelectorAll('.form-tab');
  const smsTab = document.getElementById('smsTab');
  const emailTab = document.getElementById('emailTab');

  formTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      formTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabName = tab.dataset.tab;
      if (tabName === 'sms') {
        smsTab.classList.remove('hidden');
        emailTab.classList.add('hidden');
      } else {
        smsTab.classList.add('hidden');
        emailTab.classList.remove('hidden');
      }
    });
  });

  // ========================================
  // FAQ Accordion
  // ========================================
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  // ========================================
  // Category Cards Click Handler
  // ========================================
  const categoryCards = document.querySelectorAll('.category-card');
  
  categoryCards.forEach(function(card) {
    card.addEventListener('click', function(e) {
      e.preventDefault();
      const t = translations[currentLang];
      alert((t && t.comingSoon) ? t.comingSoon : 'Ofertat për këtë kategori do të jenë të disponueshme së shpejti! 🚀');
    });
  });

  // ========================================
  // Partner Form Validation & Submission
  // ========================================
  const partnerForm = document.getElementById('partnerForm');
  
  if (partnerForm) {
    partnerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      partnerForm.querySelectorAll('.form-group').forEach(group => {
        group.classList.remove('has-error');
      });
      
      let isValid = true;
      const requiredFields = ['businessName', 'businessType', 'ownerName', 'address', 'partnerEmail', 'partnerPhone'];
      
      requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        const group = field.closest('.form-group');
        
        if (!field.value.trim()) {
          group.classList.add('has-error');
          isValid = false;
        }
      });
      
      const emailField = document.getElementById('partnerEmail');
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailField.value && !emailRegex.test(emailField.value)) {
        emailField.closest('.form-group').classList.add('has-error');
        isValid = false;
      }
      
      const termsCheckbox = document.getElementById('terms');
      if (!termsCheckbox.checked) {
        termsCheckbox.closest('.form-group').classList.add('has-error');
        isValid = false;
      }
      
      if (!isValid) return;
      
      const submitBtn = partnerForm.querySelector('button[type="submit"]');
      submitBtn.classList.add('btn-loading');
      submitBtn.disabled = true;
      
      // Build phone number with prefix
      const prefix = document.getElementById('phonePrefix2').value;
      const phone = document.getElementById('partnerPhone').value;
      const fullPhone = prefix + ' ' + phone;
      
      try {
        const apiBase = (window.SAVORA_CONFIG && window.SAVORA_CONFIG.API_BASE) || 'https://savoraapp-api.sparkling-scene-16e3.workers.dev';
        const response = await fetch(apiBase + '/api/partner/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('partnerEmail').value.trim(),
            name: document.getElementById('ownerName').value.trim(),
            business: document.getElementById('businessName').value.trim(),
            businessType: document.getElementById('businessType').value,
            nui: document.getElementById('nui').value.trim(),
            address: document.getElementById('address').value.trim(),
            phone: fullPhone
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          partnerForm.querySelectorAll('.form-group, .form-row, button[type="submit"]').forEach(el => {
            el.style.display = 'none';
          });
          document.getElementById('formSuccess').classList.add('active');
        } else {
          submitBtn.classList.remove('btn-loading');
          submitBtn.disabled = false;
          alert(data.error || 'Fout bij verzenden. Probeer opnieuw.');
        }
      } catch (err) {
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;
        alert('Verbindingsfout. Probeer opnieuw of ga naar partner.html');
      }
    });
  }

  // ========================================
  // Intersection Observer for Animations
  // ========================================
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  const animateElements = document.querySelectorAll(
    '.section-header, .category-card, .step, .benefit-card, .pricing-card, .testimonial-card, .faq-item'
  );
  
  animateElements.forEach(el => observer.observe(el));

  // ========================================
  // Lazy Loading Images
  // ========================================
  if ('IntersectionObserver' in window) {
    const lazyImages = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    });

    lazyImages.forEach(img => imageObserver.observe(img));
  }

  // ========================================
  // Console Welcome Message
  // ========================================

})();
