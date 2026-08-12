// Modern Sidebar Navigation JavaScript
function initializeSidebar() {
    console.log('Initializing modern sidebar...');
    
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarContainer = document.getElementById('sidebarContainer');
    const main = document.querySelector('.main');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const marketplaceItem = document.querySelector('.marketplace-item');

    console.log('Elements found:', {
        sidebar: !!sidebar,
        sidebarToggleBtn: !!sidebarToggleBtn,
        sidebarOverlay: !!sidebarOverlay,
        sidebarContainer: !!sidebarContainer,
        main: !!main,
        darkModeToggle: !!darkModeToggle,
        marketplaceItem: !!marketplaceItem
    });

    if (!sidebar || !sidebarToggleBtn) {
        console.error('Required sidebar elements not found!');
        return;
    }

    // Show/hide sidebar
    function toggleSidebarVisibility() {
        console.log('Toggle sidebar visibility clicked');
        const isActive = sidebar.classList.contains('active');
        
        if (isActive) {
            // Hide sidebar
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            if (sidebarContainer) {
                sidebarContainer.classList.remove('active');
            }
            if (main) {
                main.classList.remove('sidebar-open');
            } else {
                // Fallback for pages without .main element
                document.body.classList.remove('sidebar-open');
            }
            console.log('Sidebar hidden');
        } else {
            // Show sidebar
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
            if (sidebarContainer) {
                sidebarContainer.classList.add('active');
            }
            if (main) {
                main.classList.add('sidebar-open');
            } else {
                // Fallback for pages without .main element
                document.body.classList.add('sidebar-open');
            }
            console.log('Sidebar shown');
        }
    }


    // Close sidebar on mobile
    function closeSidebar() {
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            if (sidebarContainer) {
                sidebarContainer.classList.remove('active');
            }
            if (main) {
                main.classList.remove('sidebar-open');
            } else {
                document.body.classList.remove('sidebar-open');
            }
        }
    }

    // Event listeners
    sidebarToggleBtn.addEventListener('click', toggleSidebarVisibility);
    console.log('Sidebar toggle button event listener added');

    // Mobile overlay click to close
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', function() {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            if (sidebarContainer) {
                sidebarContainer.classList.remove('active');
            }
            if (main) {
                main.classList.remove('sidebar-open');
            } else {
                document.body.classList.remove('sidebar-open');
            }
        });
    }

    // Dark mode toggle
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', function() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const newTheme = isDark ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            darkModeToggle.classList.toggle('active', newTheme === 'dark');
            
            console.log('Theme changed to:', newTheme);
        });
    }


    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (darkModeToggle) {
        darkModeToggle.classList.toggle('active', savedTheme === 'dark');
    }

    // Enhanced click effect for marketplace item
    if (marketplaceItem) {
        marketplaceItem.addEventListener('click', (e) => {
            marketplaceItem.style.transform = 'scale(0.95)';
            setTimeout(() => {
                marketplaceItem.style.transform = '';
            }, 150);
        });
    }

    // Click effects for navigation items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            item.style.transform = 'scale(0.95)';
            setTimeout(() => {
                item.style.transform = '';
            }, 150);
        });
    });

    // Mobile responsiveness
    function handleResize() {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            if (sidebarContainer) {
                sidebarContainer.classList.remove('active');
            }
            if (main) {
                main.classList.remove('sidebar-open');
            } else {
                document.body.classList.remove('sidebar-open');
            }
        }
    }

    window.addEventListener('resize', handleResize);

    console.log('Modern sidebar initialized successfully');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing sidebar...');
    initializeSidebar();
});

// Also try to initialize immediately in case DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSidebar);
} else {
    initializeSidebar();
}
