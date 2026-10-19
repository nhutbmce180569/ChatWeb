// MessageZ — site.js (responsive navigation & UI interactions)
document.addEventListener('DOMContentLoaded', function () {
    const navToggle = document.getElementById('mzNavToggle');
    const mobileMenu = document.getElementById('mzMobileMenu');
    const mobileBackdrop = document.getElementById('mzMobileBackdrop');
    const backToTopBtn = document.getElementById('backToTopBtn');

    function closeMobileMenu() {
        if (!mobileMenu) return;
        mobileMenu.classList.remove('is-open');
        if (mobileBackdrop) mobileBackdrop.classList.remove('is-open');
        if (navToggle) {
            navToggle.classList.remove('is-active');
            navToggle.setAttribute('aria-expanded', 'false');
        }
        document.body.style.overflow = '';
    }

    function openMobileMenu() {
        if (!mobileMenu) return;
        mobileMenu.classList.add('is-open');
        if (mobileBackdrop) mobileBackdrop.classList.add('is-open');
        if (navToggle) {
            navToggle.classList.add('is-active');
            navToggle.setAttribute('aria-expanded', 'true');
        }
        document.body.style.overflow = 'hidden';
    }

    if (navToggle && mobileMenu) {
        navToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            const isOpen = mobileMenu.classList.contains('is-open');
            if (isOpen) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });
    }

    if (mobileBackdrop) {
        mobileBackdrop.addEventListener('click', closeMobileMenu);
    }

    // Close when clicking internal links in mobile menu
    if (mobileMenu) {
        mobileMenu.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                closeMobileMenu();
            });
        });
    }

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mobileMenu && mobileMenu.classList.contains('is-open')) {
            closeMobileMenu();
        }
    });

    // Close on resize to desktop (>= 769px)
    window.addEventListener('resize', function () {
        if (window.innerWidth > 768 && mobileMenu && mobileMenu.classList.contains('is-open')) {
            closeMobileMenu();
        }
    });

    // Back to top button
    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href && href.length > 1) {
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const navHeight = 64;
                    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
});
