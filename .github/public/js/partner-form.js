
// ===== PARTNER FORM SCROLL =====
(function() {
  var partnerBtns = document.querySelectorAll('[href="#partner-form-wrapper"], .partner-mode-btn');
  
  partnerBtns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var partnerForm = document.getElementById('partner-form-wrapper');
      if (partnerForm) {
        partnerForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
})();

