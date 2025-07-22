// js/main.js

// === Firebase Initialization ===
const firebaseConfig = {
    apiKey: "AIzaSyC5erEj7SLOaC5gl71jUVCUalu1Bv_e7cc",
    authDomain: "financial-tracker-ceace.firebaseapp.com",
    projectId: "financial-tracker-ceace",
    storageBucket: "financial-tracker-ceace.firebasestorage.app",
    messagingSenderId: "434356653815",
    appId: "1:434356653815:web:c554a51d07536b135d8df2",
    measurementId: "G-0LKDFM8CGQ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Export Auth and Firestore instances globally (or make them accessible)
const auth = firebase.auth();
const db = firebase.firestore();
// === End Firebase Initialization ===


document.addEventListener('DOMContentLoaded', () => {
    // === Global Navigation and Hamburger Menu Logic ===
    const hamburgerMenu = document.getElementById('hamburger-menu');
    // We now select the <nav> element, as it's the one we'll apply 'active' to
    const mainNav = document.querySelector('header nav'); 
    const header = document.querySelector('header'); // Needed for blur-background logic on other pages

    // Selects only anchors within header nav ul li, excluding buttons.
    const navLinks = document.querySelectorAll('header nav ul li a'); 

    // Function to Highlight Current Page in Navigation
    function highlightCurrentPage() {
        const path = window.location.pathname;
        navLinks.forEach(link => {
            link.classList.remove('active'); // Use 'active' as per our CSS
            const linkPath = new URL(link.href).pathname;
            
            // Normalize paths for comparison (e.g., remove trailing slashes)
            // Handle both root '/' and '/index.html' for the Dashboard link
            const normalizedPath = (path.endsWith('/') && path.length > 1) ? path.slice(0, -1) : path;
            const normalizedLinkPath = (linkPath.endsWith('/') && linkPath.length > 1) ? linkPath.slice(0, -1) : linkPath;

            // Handle cases where the current path is just '/' or '/index.html'
            const isDashboardLink = normalizedLinkPath.endsWith('/index.html') || normalizedLinkPath === '/';
            const isCurrentPathDashboard = normalizedPath === '/' || normalizedPath.endsWith('/index.html');

            if (normalizedPath === normalizedLinkPath || (isDashboardLink && isCurrentPathDashboard)) {
                link.classList.add('active'); // Add 'active' class
            }
        });
    }

    // Call highlight function on load
    highlightCurrentPage();

    // Hamburger menu toggle logic
    if (hamburgerMenu && mainNav) { // Check if both elements exist
        hamburgerMenu.addEventListener('click', () => {
            console.log("Hamburger menu clicked!"); // Debugging log
            mainNav.classList.toggle('active'); // Toggles 'active' class on the <nav> element
            hamburgerMenu.classList.toggle('active'); // Toggles 'active' on the button itself (for styling changes)
            console.log("Nav classes after toggle:", mainNav.classList); // Debugging
        });

        // Close menu if a nav link is clicked (good for UX on mobile)
        mainNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (mainNav.classList.contains('active')) {
                    mainNav.classList.remove('active');
                    hamburgerMenu.classList.remove('active');
                }
            });
        });
    } else {
        console.warn("Hamburger menu button or main navigation element(s) not found. This might be expected on pages without a header/nav or due to incorrect IDs.");
    }
    // === End Global Navigation and Hamburger Menu Logic ===


    // === Authentication State Listener and Logout ===
    const logoutButton = document.getElementById('logout-button');
    const usernameDisplay = document.getElementById('username-display'); // For dashboard

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
            document.querySelectorAll('main, footer').forEach(el => {
                el.style.display = 'none'; // Hide main content and footer
            });
            
            if (logoutButton) logoutButton.style.display = 'none'; // Hide logout button
            if (usernameDisplay) usernameDisplay.textContent = 'Guest'; // Set a default for logged out state
        }
    });

    // Logout Functionality
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