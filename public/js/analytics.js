// Savoraapp Analytics - Lightweight tracking system
(function() {
  'use strict';
  
  var STORAGE_KEY = 'savora_analytics';
  var SESSION_KEY = 'savora_session';
  
  // Generate unique visitor ID
  function getVisitorId() {
    var id = localStorage.getItem('savora_visitor_id');
    if (!id) {
      id = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('savora_visitor_id', id);
    }
    return id;
  }
  
  // Get or create session
  function getSession() {
    var session = sessionStorage.getItem(SESSION_KEY);
    var now = Date.now();
    
    if (session) {
      session = JSON.parse(session);
      // Session expires after 30 minutes of inactivity
      if (now - session.lastActivity > 30 * 60 * 1000) {
        session = null;
      }
    }
    
    if (!session) {
      session = {
        id: 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        startTime: now,
        lastActivity: now,
        pageViews: 0,
        pages: []
      };
    }
    
    session.lastActivity = now;
    session.pageViews++;
    session.pages.push({
      url: window.location.pathname + window.location.hash,
      title: document.title,
      time: now
    });
    
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }
  
  // Store analytics event
  function storeEvent(type, data) {
    var analytics = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    var event = {
      type: type,
      data: data || {},
      visitorId: getVisitorId(),
      sessionId: getSession().id,
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      hour: new Date().getHours(),
      url: window.location.pathname + window.location.hash,
      referrer: document.referrer || 'direct'
    };
    
    analytics.push(event);
    
    // Keep max 5000 events to prevent storage overflow
    if (analytics.length > 5000) {
      analytics = analytics.slice(-4000);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(analytics));
    
    // Also send to backend if available (fire and forget)
    try {
      if (window.navigator.onLine) {
        fetch((window.API_BASE_URL || ((window.SAVORA_CONFIG && window.SAVORA_CONFIG.API_BASE) || 'https://savoraapp-api.de262f98ef47a3a6c986661d98a0c217.workers.dev')) + '/api/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
          keepalive: true
        }).catch(function() {});
      }
    } catch(e) {}
  }
  
  // Track page view
  function trackPageView() {
    var session = getSession();
    storeEvent('pageview', {
      page: window.location.pathname + window.location.hash,
      title: document.title,
      sessionPageViews: session.pageViews
    });
  }
  
  // Track event
  function trackEvent(category, action, label, value) {
    storeEvent('event', {
      category: category,
      action: action,
      label: label || '',
      value: value || 0
    });
  }
  
  // Track conversion
  function trackConversion(type, value) {
    storeEvent('conversion', {
      type: type,
      value: value || 0
    });
  }
  
  // Get analytics summary for admin dashboard
  function getAnalyticsSummary() {
    var analytics = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    var sessions = {};
    var visitors = {};
    var pageViews = {};
    var conversions = { registrations: 0, reservations: 0, partnerSignups: 0 };
    var hourly = new Array(24).fill(0);
    var daily = {};
    var referrers = {};
    var devices = { mobile: 0, desktop: 0, tablet: 0 };
    
    var now = Date.now();
    var today = new Date().toISOString().split('T')[0];
    var thisWeek = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    var todayVisits = 0;
    var weekVisits = 0;
    
    analytics.forEach(function(event) {
      // Unique sessions
      if (event.sessionId) sessions[event.sessionId] = true;
      if (event.visitorId) visitors[event.visitorId] = true;
      
      // Page views by page
      if (event.type === 'pageview') {
        var page = event.data.page || event.url || '/';
        pageViews[page] = (pageViews[page] || 0) + 1;
        
        // Hourly distribution
        if (event.hour !== undefined) hourly[event.hour]++;
        
        // Daily stats
        if (event.date) {
          daily[event.date] = (daily[event.date] || 0) + 1;
          if (event.date === today) todayVisits++;
          if (event.date >= thisWeek) weekVisits++;
        }
      }
      
      // Conversions
      if (event.type === 'conversion') {
        if (event.data.type === 'registration') conversions.registrations++;
        if (event.data.type === 'reservation') conversions.reservations++;
        if (event.data.type === 'partner_signup') conversions.partnerSignups++;
      }
      
      // Referrers
      if (event.referrer) {
        var ref = event.referrer;
        if (ref === 'direct') ref = 'Direct';
        else if (ref.includes('google')) ref = 'Google';
        else if (ref.includes('facebook')) ref = 'Facebook';
        else if (ref.includes('instagram')) ref = 'Instagram';
        else ref = 'Other';
        referrers[ref] = (referrers[ref] || 0) + 1;
      }
    });
    
    // Detect device type
    var ua = navigator.userAgent;
    if (/Mobi|Android/i.test(ua)) devices.mobile++;
    else if (/iPad|Tablet/i.test(ua)) devices.tablet++;
    else devices.desktop++;
    
    // Get last 7 days for chart
    var last7Days = [];
    var last7Labels = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now - i * 24 * 60 * 60 * 1000);
      var dateStr = d.toISOString().split('T')[0];
      last7Days.push(daily[dateStr] || 0);
      last7Labels.push(d.toLocaleDateString('nl-NL', { weekday: 'short' }));
    }
    
    // Top pages
    var topPages = Object.entries(pageViews)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 10);
    
    return {
      totalEvents: analytics.length,
      uniqueSessions: Object.keys(sessions).length,
      uniqueVisitors: Object.keys(visitors).length,
      todayVisits: todayVisits,
      weekVisits: weekVisits,
      pageViews: Object.values(pageViews).reduce(function(a, b) { return a + b; }, 0),
      conversions: conversions,
      hourly: hourly,
      last7Days: last7Days,
      last7Labels: last7Labels,
      referrers: referrers,
      devices: devices,
      topPages: topPages,
      daily: daily
    };
  }
  
  // Auto-track on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageView);
  } else {
    trackPageView();
  }
  
  // Track hash changes (SPA navigation)
  window.addEventListener('hashchange', trackPageView);
  
  // Expose global API
  window.SavoraAnalytics = {
    track: trackEvent,
    trackConversion: trackConversion,
    getSummary: getAnalyticsSummary,
    getRawData: function() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); },
    clear: function() { localStorage.removeItem(STORAGE_KEY); }
  };
  
  // Track key interactions automatically
  document.addEventListener('click', function(e) {
    var target = e.target.closest('a, button, .btn');
    if (!target) return;
    
    var text = target.textContent || target.innerText || '';
    text = text.trim().substring(0, 50);
    
    if (target.id) {
      trackEvent('click', target.id, text);
    } else if (target.className && target.className.includes('btn')) {
      trackEvent('click', 'button', text);
    }
  });
  
})();
