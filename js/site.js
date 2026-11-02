// G.H.O.S.T. website: reveal on scroll, the laptop morph, counters, menu and the demo form.
// Everything on the page is readable without this file; it only adds polish.
(function () {
  var doc = document.documentElement;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  // Header: solid once the page scrolls. Menu on small screens.
  var head = document.querySelector('.site-head');
  var onScroll = function () { if (head) head.classList.toggle('scrolled', window.scrollY > 12); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  var btn = document.querySelector('.menu-btn'), nav = document.getElementById('site-nav');
  if (btn && nav) {
    btn.addEventListener('click', function () { var o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }); });
  }

  // Reveal on scroll, plus counters.
  var count = function (el) {
    var to = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (calm) { el.textContent = to; return; }
    var t0 = null;
    var step = function (t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / 1300); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  var targets = document.querySelectorAll('[data-reveal], [data-count]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        if (e.target.hasAttribute('data-count')) count(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(function (el) { io.observe(el); });
  } else {
    targets.forEach(function (el) { el.classList.add('in'); });
  }

  // The morph: the laptop stays put, the screens slide up inside it and the words scroll up and away.
  // Every step is held for most of its slice of the scroll before the next one arrives.
  Array.prototype.forEach.call(document.querySelectorAll('.morph'), function (morph) {
    var steps = Array.prototype.slice.call(morph.querySelectorAll('.mstep'));
    var shots = Array.prototype.slice.call(morph.querySelectorAll('.mbk-glass img'));
    var track = morph.querySelector('.morph-track');
    var N = steps.length || 1;
    var render = function () {
      if (!track || window.innerWidth <= 860) return;
      var total = track.offsetHeight - window.innerHeight;
      var p = total > 0 ? Math.min(Math.max(-track.getBoundingClientRect().top / total, 0), 1) : 0;
      var seg = p * N;
      var idx = Math.min(Math.floor(seg), N - 1);
      var t = (seg - idx - 0.55) / 0.45;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      t = t * t * (3 - 2 * t);
      var f = Math.min(idx + t, N - 1);
      var fs = N > 1 ? f * (shots.length - 1) / (N - 1) : 0;   // spread the screens across the steps
      shots.forEach(function (s, k) {
        var d = k - fs;
        s.style.transform = 'translateY(' + (d * 100) + '%)';
        s.style.opacity = Math.abs(d) < 1.0001 ? '1' : '0';
      });
      steps.forEach(function (s, j) {
        var dd = j - f;
        s.style.transform = 'translateY(calc(-50% + ' + (dd * 64).toFixed(1) + 'px))';
        s.style.opacity = Math.max(0, 1 - Math.abs(dd) * 1.3).toFixed(3);
      });
    };
    window.addEventListener('scroll', render, { passive: true });
    window.addEventListener('resize', render);
    render();
  });

  // Demo form. The address it sends to is data-email on the <form>.
  var form = document.querySelector('form[data-email]');
  if (!form || !window.fetch) return;
  var email = form.getAttribute('data-email').trim();
  var status = document.getElementById('form-status');
  var button = form.querySelector('button[type="submit"]');
  var label = button ? button.textContent : '';
  var show = function (msg, isError) { status.hidden = false; status.className = 'form-status' + (isError ? ' err' : ''); status.textContent = msg; status.focus(); };
  form.addEventListener('submit', function (e) {
    if (!form.checkValidity()) return;
    e.preventDefault();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    if (data._honey) return;
    if (button) { button.disabled = true; button.textContent = 'Sending...'; }
    fetch('https://formsubmit.co/ajax/' + email, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && (j.success === 'true' || j.success === true)) { form.reset(); show('Thank you. We received your request and will reply by email.', false); }
        else { show('That did not send. Please email support@ghostplatform.ai instead.', true); }
      })
      .catch(function () { show('That did not send. Please email support@ghostplatform.ai instead.', true); })
      .then(function () { if (button) { button.disabled = false; button.textContent = label; } });
  });
})();
