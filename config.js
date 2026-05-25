// ========================================
// Savoraapp - Frontend Configuration
// Auto-switches API URL based on hostname
// ========================================

(function() {
  'use strict';

  var hostname = window.location.hostname;
  var port = window.location.port;
  var protocol = window.location.protocol;

  // ---- API URL Switch ----
  // Als frontend + backend op ZELFDE domein: gebruik relatieve URL ('')
  // Als frontend + backend op VERSCHILLENDE domeinen: specificeer volledige URL
  var API_URLS = {
    // Local development
    localhost: 'http://localhost:3000',
    '127.0.0.1': 'http://127.0.0.1:3000',
    // Productie: directe Worker URL (werkt altijd)
    'savoraapp.com': 'https://savoraapp-api.sparkling-scene-16e3.workers.dev',
    'www.savoraapp.com': 'https://savoraapp-api.sparkling-scene-16e3.workers.dev',
    // Pages preview URLs
    '7b284410.savoraapp-eh5.pages.dev': 'https://savoraapp-api.sparkling-scene-16e3.workers.dev',
    'main.savoraapp-eh5.pages.dev': 'https://savoraapp-api.sparkling-scene-16e3.workers.dev',
    'f66baad9.savoraapp.pages.dev': 'https://savoraapp-api.sparkling-scene-16e3.workers.dev'
  };

  // Bepaal de API base URL
  var API_BASE = API_URLS[hostname];

  // Fallback: alle *.savoraapp.pages.dev URLs
  if (!API_BASE && hostname.endsWith('.savoraapp.pages.dev')) {
    API_BASE = 'https://savoraapp-api.sparkling-scene-16e3.workers.dev';
  }

  // Fallback: directe worker URL bezoek
  if (!API_BASE && hostname.endsWith('.workers.dev')) {
    API_BASE = 'https://savoraapp-api.sparkling-scene-16e3.workers.dev';
  }

  // Laatste fallback: localhost
  if (API_BASE === undefined) {
    API_BASE = 'http://localhost:3000';
  }

  // ---- Config Object ----
  window.SAVORA_CONFIG = {
    API_BASE: API_BASE,
    FRONTEND_URL: protocol + '//' + hostname + (port ? ':' + port : ''),
    ENV: hostname === 'localhost' || hostname === '127.0.0.1' ? 'development' : 'production',
    SESSION_TIMEOUT: 30 * 60 * 1000,  // 30 minuten in ms
    AD_PRICE_LEK: 200,
    CREDIT_PACKAGES: [
      { id: 1, credits: 20, price: 500, label: 'Pako Baze' },
      { id: 2, credits: 50, price: 1000, label: 'Pako Standarte' },
      { id: 3, credits: 100, price: 1800, label: 'Pako Premium' }
    ]
  };

  // ---- Logging (alleen in development) ----
  if (window.SAVORA_CONFIG.ENV === 'development') {
    console.log('[Savoraapp] Config loaded:', {
      env: window.SAVORA_CONFIG.ENV,
      apiBase: window.SAVORA_CONFIG.API_BASE
    });
  }

})();
