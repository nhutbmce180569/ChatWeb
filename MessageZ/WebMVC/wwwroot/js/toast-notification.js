/**
 * toast-notification.js — MessageZ 2026 Design System Toast
 * Glassmorphic · Theme-aware · Fluid spring animation · SVG Icons
 */

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    let accentColor = 'var(--primary)';
    let accentBg = 'rgba(99, 102, 241, 0.14)';
    let borderTint = 'rgba(99, 102, 241, 0.35)';
    let iconSvg = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
    `;

    if (type === 'success') {
        accentColor = 'var(--green, #10b981)';
        accentBg = 'rgba(16, 185, 129, 0.15)';
        borderTint = 'rgba(16, 185, 129, 0.35)';
        iconSvg = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5"/>
            </svg>
        `;
    } else if (type === 'error') {
        accentColor = 'var(--red, #f43f5e)';
        accentBg = 'rgba(244, 63, 94, 0.15)';
        borderTint = 'rgba(244, 63, 94, 0.35)';
        iconSvg = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        `;
    } else if (type === 'warning') {
        accentColor = 'var(--amber, #f59e0b)';
        accentBg = 'rgba(245, 158, 11, 0.15)';
        borderTint = 'rgba(245, 158, 11, 0.35)';
        iconSvg = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
        `;
    }

    const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const duration = Math.max(4500, Math.min(8500, 3600 + (message ? message.length * 45 : 0)));

    const toastHTML = `
        <div id="${toastId}" class="toast mb-3 mz-toast-card" role="alert" aria-live="assertive" aria-atomic="true"
             style="border-left: 3px solid ${accentColor} !important;">
            <div class="d-flex align-items-start justify-content-between p-3 gap-2">
                <div class="d-flex align-items-center gap-2 flex-grow-1" style="min-width:0;">
                    <div class="mz-toast-icon-box flex-shrink-0 mt-0" style="background-color: ${accentBg}; color: ${accentColor}; border: 1px solid ${borderTint};">
                        ${iconSvg}
                    </div>
                    <div class="mz-toast-text flex-grow-1" style="min-width:0;">
                        ${message}
                    </div>
                </div>
                <button type="button" class="btn-close mz-toast-close ms-2 flex-shrink-0 mt-1" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="mz-toast-progress-bar" style="background: ${accentColor}; animation-duration: ${duration}ms;"></div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', toastHTML);

    const toastEl = document.getElementById(toastId);
    if (!toastEl) return;

    const toast = new bootstrap.Toast(toastEl, {
        delay: duration,
        animation: true
    });

    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}
