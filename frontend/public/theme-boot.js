// Paint the school's colours and dark mode before the app loads, so there is no flash of the default look.
// The ThemeProvider writes the stylesheet text to localStorage after every theme change.
(function () {
  try {
    var c = JSON.parse(localStorage.getItem('aul-theme-cache') || 'null');
    var u = localStorage.getItem('aul-mode');
    var d = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (c && c.light) {
      var m = (u === 'light' || u === 'dark') ? u : (c.mode === 'system' ? (d ? 'dark' : 'light') : c.mode);
      var st = document.createElement('style'); st.id = 'aul-theme'; st.textContent = m === 'dark' ? c.dark : c.light; document.head.appendChild(st);
      document.documentElement.setAttribute('data-theme', m); document.documentElement.style.colorScheme = m;
    }
  } catch (e) { /* the app still paints the default look */ }
})();
