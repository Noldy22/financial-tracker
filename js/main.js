document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logout-button');
    const usernameDisplay = document.getElementById('username-display'); // For dashboard
    // Selects only anchors within header nav ul li, excluding buttons.
    const navLinks = document.querySelectorAll('header nav ul li a'); 

    // --- Function to Highlight Current Page in Navigation ---
    function highlightCurrentPage() {
        const path = window.location.pathname;
        navLinks.forEach(link => {
            link.classList.remove('active-nav'); // Remove from all first
            const linkPath = new URL(link.href).pathname;
            // Normalize paths for comparison (e.g., remove trailing slashes)
            const normalizedPath = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
            const normalizedLinkPath = linkPath.endsWith('/') && linkPath.length > 1 ? linkPath.slice(0, -1) : linkPath;

            // Check if the link's path is a direct match or if it's the root index page
            if (normalizedPath.includes(normalizedLinkPath) && normalizedLinkPath.length > 1 || 
                (normalizedPath === '/' || normalizedPath.endsWith('/index.html')) && normalizedLinkPath.endsWith('/index.html')) {
                link.classList.add('active-nav');
            }
        });
    }

    // Call highlight function on load
    highlightCurrentPage();

    // --- Authentication State Listener ---
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // User is logged in
            console.log('User logged in:', user.uid);

            // If we are on the auth.html page, redirect to dashboard
            if (window.location.pathname.endsWith('auth.html')) {
                window.location.href = 'index.html';
                return; // Prevent further execution on auth.html after redirect
            }

            // Fetch username from Firestore and update display on dashboard
            if (usernameDisplay) { // Check if element exists (only on dashboard)
                try {
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    if (userDoc.exists && userDoc.data() && userDoc.data().username) { // Ensure data() exists and then check username
                        usernameDisplay.textContent = userDoc.data().username;
                    } else if (user.displayName) { // Fallback to Firebase Auth displayName
                        usernameDisplay.textContent = user.displayName;
                    } else { // Fallback to email if no username or displayName
                        usernameDisplay.textContent = user.email;
                    }
                } catch (error) {
                    console.error("Error fetching username from Firestore:", error);
                    // Fallback to displayName or email even if Firestore fetch fails
                    usernameDisplay.textContent = user.displayName || user.email;
                }
            }

            // Show protected content elements
            document.querySelectorAll('main, footer').forEach(el => {
                el.style.display = ''; // Revert to default display (ensure visible)
            });
            // Also ensure nav is visible if it was hidden for unauthenticated users
            const headerNav = document.querySelector('header nav');
            if (headerNav) headerNav.style.display = ''; // Show navigation
            if (logoutButton) logoutButton.style.display = 'inline-block'; // Show logout button

        } else {
            // User is logged out
            console.log('User logged out');

            // If we are on a protected page (index or details), redirect to auth.html
            if (!window.location.pathname.endsWith('auth.html')) {
                if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('details.html') || window.location.pathname.endsWith('/')) {
                     window.location.href = 'auth.html';
                }
            }

            // Hide protected content elements (or ensure they are hidden)
            // For this setup, redirection handles most of it, but good to be explicit
            document.querySelectorAll('main, footer').forEach(el => {
                el.style.display = 'none'; // Hide main content and footer
            });
            const headerNav = document.querySelector('header nav');
            if (headerNav) headerNav.style.display = 'none'; // Hide navigation
            if (logoutButton) logoutButton.style.display = 'none'; // Hide logout button
            if (usernameDisplay) usernameDisplay.textContent = 'Guest'; // Set a default for logged out state
        }
    });

    // --- Logout Functionality ---
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await auth.signOut();
                // Redirect to auth.html after logout is handled by onAuthStateChanged
            } catch (error) {
                console.error("Logout error:", error);
                alert("Failed to log out. Please try again.");
            }
        });
    }
});