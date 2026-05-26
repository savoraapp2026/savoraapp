// v20260526060804
(function() {
  'use strict';
  var API_BASE = 'https://savoraapp-api.sparkling-scene-16e3.workers.dev';
  window.SAVORA_CONFIG = {
    API_BASE: API_BASE,
    FRONTEND_URL: window.location.protocol + '//' + window.location.hostname,
    ENV: window.location.hostname === 'localhost' ? 'development' : 'production',
    SESSION_TIMEOUT: 30 * 60 * 1000,
    AD_PRICE_LEK: 200,
    CREDIT_PACKAGES: [
      { id: 1, credits: 20, price: 500, label: 'Pako Baze' },
      { id: 2, credits: 50, price: 1000, label: 'Pako Standarte' },
      { id: 3, credits: 100, price: 1800, label: 'Pako Premium' }
    ]
  };
  window.API_BASE_URL = API_BASE;
  console.log('[Savoraapp] API:', API_BASE);
})();
