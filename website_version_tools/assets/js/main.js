/**
 * main.js — Shared initialization for all GSPN Website Tools pages
 * Handles tab switching, bottom nav highlighting, and general page setup.
 */

(function() {
  'use strict';

  // ── Tab Switching (tools.html) ─────────────────────────────────────────────
  var pageTabs = document.querySelectorAll('.page-tab');
  if (pageTabs.length > 0) {
    pageTabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var target = this.getAttribute('data-tab');

        // Deactivate all tabs
        pageTabs.forEach(function(t) { t.classList.remove('active'); });

        // Activate clicked tab
        this.classList.add('active');

        // Hide all panes
        var panes = document.querySelectorAll('.tab-pane');
        panes.forEach(function(p) { p.classList.add('hidden'); p.classList.remove('active'); });

        // Show target pane
        var targetPane = document.getElementById('pane-' + target);
        if (targetPane) {
          targetPane.classList.remove('hidden');
          targetPane.classList.add('active');
        }
      });
    });
  }

  // ── Bottom Nav Active Highlight ────────────────────────────────────────────
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  var navItems = document.querySelectorAll('.bottom-nav-item');
  navItems.forEach(function(item) {
    var href = item.getAttribute('href') || '';
    item.classList.remove('active');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      item.classList.add('active');
    }
  });

  // Also highlight top nav
  var topNavLinks = document.querySelectorAll('.nav-link');
  topNavLinks.forEach(function(link) {
    var href = link.getAttribute('href') || '';
    link.classList.remove('active');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

})();
