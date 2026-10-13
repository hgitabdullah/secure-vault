// Apply the saved theme before React renders (avoids a flash). External file so CSP can forbid inline scripts.
try { if (localStorage.getItem('sv-theme') === 'light') document.documentElement.classList.add('light'); } catch (e) { /* ignore */ }
