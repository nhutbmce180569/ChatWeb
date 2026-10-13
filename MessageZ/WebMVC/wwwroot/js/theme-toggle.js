/* theme-toggle.js — MessageZ dark/light mode */
(function() {
    const KEY = 'mz-theme';
    const root = document.documentElement;

    function apply(theme) {
        root.setAttribute('data-theme', theme);
        localStorage.setItem(KEY, theme);
    }

    // On load: restore saved or detect system preference
    const saved = localStorage.getItem(KEY);
    if (saved) {
        apply(saved);
    } else {
        apply(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    }

    // Toggle on button click (multiple buttons supported)
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('[data-theme-toggle]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
            });
        });
    });
})();
