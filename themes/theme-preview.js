document.querySelectorAll('[data-preview-tabs]').forEach(function(tabGroup) {
    const buttons = tabGroup.querySelectorAll('[data-target]');
    const root = tabGroup.closest('.site-shell');
    buttons.forEach(function(button) {
        button.addEventListener('click', function() {
            buttons.forEach(function(item) {
                const selected = item === button;
                item.classList.toggle('is-active', selected);
                item.setAttribute('aria-selected', String(selected));
            });
            root.querySelectorAll('[data-screen]').forEach(function(screen) {
                screen.hidden = screen.dataset.screen !== button.dataset.target;
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
});
