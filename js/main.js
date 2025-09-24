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
    const mainNav = document.querySelector('header nav'); 
    const header = document.querySelector('header');
    const navLinks = document.querySelectorAll('header nav ul li a'); 

    function highlightCurrentPage() {
        const path = window.location.pathname;
        navLinks.forEach(link => {
            link.classList.remove('active');
            const linkPath = new URL(link.href).pathname;
            const normalizedPath = (path.endsWith('/') && path.length > 1) ? path.slice(0, -1) : path;
            const normalizedLinkPath = (linkPath.endsWith('/') && linkPath.length > 1) ? linkPath.slice(0, -1) : linkPath;
            const isDashboardLink = normalizedLinkPath.endsWith('/index.html') || normalizedLinkPath === '/';
            const isCurrentPathDashboard = normalizedPath === '/' || normalizedPath.endsWith('/index.html');

            if (normalizedPath === normalizedLinkPath || (isDashboardLink && isCurrentPathDashboard)) {
                link.classList.add('active');
            }
        });
    }

    highlightCurrentPage();

    if (hamburgerMenu && mainNav) {
        hamburgerMenu.addEventListener('click', () => {
            mainNav.classList.toggle('active');
            hamburgerMenu.classList.toggle('active');
        });

        mainNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (mainNav.classList.contains('active')) {
                    mainNav.classList.remove('active');
                    hamburgerMenu.classList.remove('active');
                }
            });
        });
    } else {
        console.warn("Hamburger menu button or main navigation element(s) not found.");
    }

    // === Authentication State Listener and Logout ===
    const logoutButton = document.getElementById('logout-button');
    const usernameDisplay = document.getElementById('username-display');

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            if (window.location.pathname.endsWith('auth.html')) {
                window.location.href = 'index.html';
                return;
            }

            if (usernameDisplay) {
                try {
                    const userDoc = await db.collection('users').doc(user.uid).get();
                    if (userDoc.exists && userDoc.data() && userDoc.data().username) {
                        usernameDisplay.textContent = userDoc.data().username;
                    } else if (user.displayName) {
                        usernameDisplay.textContent = user.displayName;
                    } else {
                        usernameDisplay.textContent = user.email;
                    }
                } catch (error) {
                    console.error("Error fetching username from Firestore:", error);
                    usernameDisplay.textContent = user.displayName || user.email;
                }
            }
            
            if (logoutButton) logoutButton.style.display = 'inline-block';

        } else {
            if (!window.location.pathname.endsWith('auth.html')) {
                if (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('details.html') || window.location.pathname.endsWith('/')) {
                    window.location.href = 'auth.html';
                }
            }
        }
    });

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await auth.signOut();
            } catch (error) {
                console.error("Logout error:", error);
                alert("Failed to log out. Please try again.");
            }
        });
    }

    // === NEW: Custom Select Dropdown Logic ===
    function initializeCustomSelects() {
        const customSelects = document.getElementsByClassName("custom-select-wrapper");
        
        for (let i = 0; i < customSelects.length; i++) {
            const wrapper = customSelects[i];
            const selectEl = wrapper.getElementsByTagName("select")[0];
            if (!selectEl) continue;

            // Create the selected item display
            const selectedDiv = document.createElement("DIV");
            selectedDiv.setAttribute("class", "select-selected");
            selectedDiv.innerHTML = selectEl.options[selectEl.selectedIndex].innerHTML;
            wrapper.appendChild(selectedDiv);

            // Create the options list
            const optionsDiv = document.createElement("DIV");
            optionsDiv.setAttribute("class", "select-items select-hide");

            for (let j = 0; j < selectEl.length; j++) {
                const optionItem = document.createElement("DIV");
                optionItem.innerHTML = selectEl.options[j].innerHTML;
                
                optionItem.addEventListener("click", function(e) {
                    const select = this.parentNode.parentNode.getElementsByTagName("select")[0];
                    const selectedDisplay = this.parentNode.previousSibling;
                    for (let k = 0; k < select.length; k++) {
                        if (select.options[k].innerHTML == this.innerHTML) {
                            select.selectedIndex = k;
                            selectedDisplay.innerHTML = this.innerHTML;
                            const sameAsSelected = this.parentNode.getElementsByClassName("same-as-selected");
                            for (let l = 0; l < sameAsSelected.length; l++) {
                                sameAsSelected[l].removeAttribute("class");
                            }
                            this.setAttribute("class", "same-as-selected");
                            break;
                        }
                    }
                    selectedDisplay.click();
                });
                optionsDiv.appendChild(optionItem);
            }
            wrapper.appendChild(optionsDiv);

            selectedDiv.addEventListener("click", function(e) {
                e.stopPropagation();
                closeAllSelect(this);
                this.nextSibling.classList.toggle("select-hide");
                this.classList.toggle("select-arrow-active");
            });
        }
    }

    function closeAllSelect(exceptElement) {
        const selectItems = document.getElementsByClassName("select-items");
        const selectSelected = document.getElementsByClassName("select-selected");
        
        for (let i = 0; i < selectSelected.length; i++) {
            if (exceptElement == selectSelected[i]) {
                continue;
            }
            selectSelected[i].classList.remove("select-arrow-active");
        }
        for (let i = 0; i < selectItems.length; i++) {
            if (exceptElement == selectItems[i].previousSibling) {
                continue;
            }
            selectItems[i].classList.add("select-hide");
        }
    }

    // Initialize the custom dropdowns
    initializeCustomSelects();

    // Close dropdowns if user clicks outside
    document.addEventListener("click", closeAllSelect);
});