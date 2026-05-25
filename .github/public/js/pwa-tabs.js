
  (function() {
    // Service Worker V2 — fix chrome-extension:// error
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(function(reg) {
        })
        .catch(function(err) {
        });
    }
    
    // PWA Install Prompt
    var deferredPrompt;
    window.addEventListener('beforeinstallprompt', function(e) {
      e.preventDefault();
      deferredPrompt = e;
    });
    
    // Detect if running as installed app
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      document.body.classList.add('pwa-standalone');
    }
  })();

  // ===== TAB SWITCHING =====
  (function() {
    var tabs = document.querySelectorAll('.form-tab');
    var smsTab = document.getElementById('smsTab');
    var emailTab = document.getElementById('emailTab');
    
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var target = this.getAttribute('data-tab');
        
        // Update active tab
        tabs.forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        
        // Show/hide content
        if (target === 'sms') {
          smsTab.classList.remove('hidden');
          emailTab.classList.add('hidden');
        } else {
          smsTab.classList.add('hidden');
          emailTab.classList.remove('hidden');
        }
      });
    });
  })();

