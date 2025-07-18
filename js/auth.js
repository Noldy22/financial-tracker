document.addEventListener('DOMContentLoaded', () => {
    // Removed specific loginForm, signupForm, loginSection, signupSection
    // and their toggles, as we're simplifying to one section.
    
    // Consolidated error message display
    const authErrorMessage = document.getElementById('auth-error-message');

    // Google Sign-in Button (now just one)
    const googleSignInButton = document.getElementById('google-signin-button');

    // Removed password visibility toggle logic as there are no password inputs

    // Removed Handle Login and Handle Signup forms completely

    // --- Google Sign-in Logic ---
    const googleProvider = new firebase.auth.GoogleAuthProvider();

    if (googleSignInButton) {
        googleSignInButton.addEventListener('click', async () => {
            authErrorMessage.style.display = 'none'; // Clear previous errors
            try {
                const result = await auth.signInWithPopup(googleProvider);
                const user = result.user;
                
                // Check if this is a new user
                const isNewUser = result.additionalUserInfo.isNewUser;

                if (isNewUser) {
                    // For new Google sign-ups, store username (from Google profile) in Firestore
                    // Google provides display name automatically, or we can derive from email
                    await db.collection('users').doc(user.uid).set({
                        email: user.email,
                        username: user.displayName || user.email.split('@')[0], // Use Google Display Name or derive from email
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                // If existing user, main.js will fetch existing username from Firestore or use displayName.

                // Redirect is handled by onAuthStateChanged
            } catch (error) {
                console.error("Google Sign-in error:", error.code, error.message);
                authErrorMessage.textContent = formatFirebaseError(error.code);
                authErrorMessage.style.display = 'block';
            }
        });
    }

    // --- Authentication State Listener (ensures redirects) ---
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in. If they are on auth.html, redirect them to index.html
            if (window.location.pathname.endsWith('auth.html') || window.location.pathname.endsWith('/')) {
                window.location.href = 'index.html';
            }
        } else {
            // User is signed out. If they are not on auth.html, redirect to auth.html
            // This ensures index.html and details.html are protected
            if (!window.location.pathname.endsWith('auth.html')) {
                if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('details.html')) {
                     window.location.href = 'auth.html';
                }
            }
        }
    });

    // --- Helper function to format Firebase errors ---
    function formatFirebaseError(errorCode) {
        switch (errorCode) {
            case 'auth/popup-closed-by-user': // For Google Sign-in
                return 'Google sign-in popup closed or denied.';
            case 'auth/cancelled-popup-request': // For Google Sign-in
                return 'Google sign-in request cancelled or already in progress.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your internet connection.';
            default:
                return `An unexpected error occurred: ${errorCode}.`;
        }
    }
});