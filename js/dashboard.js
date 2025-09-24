document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined' || typeof firebase.firestore === 'undefined') {
        console.error("Firebase SDKs not fully loaded.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // DOM elements
    const usernameDisplay = document.getElementById('username-display');
    const currentBalanceEl = document.getElementById('current-balance');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpensesEl = document.getElementById('total-expenses');
    const todayExpenditureEl = document.getElementById('today-expenditure');
    const recentTransactionsTbody = document.getElementById('recent-transactions-tbody');
    let spendingChartCanvas = document.getElementById('spendingChart');
    let spendingChart = null;

    // Savings Goal Elements
    const savingsGoalEl = document.getElementById('savings-goal');
    const savingsProgressEl = document.getElementById('savings-progress');
    const setGoalBtn = document.getElementById('set-goal-btn');
    const savingsGoalModal = document.getElementById('savings-goal-modal');
    const savingsGoalForm = document.getElementById('savings-goal-form');
    const goalAmountInput = document.getElementById('goal-amount');
    const goalFormMessage = document.getElementById('goal-form-message');
    const progressBar = document.querySelector('.progress-bar');
    const savingsPercentage = document.getElementById('savings-percentage');

    // State Management elements
    const dashboardLoginPrompt = document.getElementById('dashboard-login-prompt');
    const dashboardSummarySection = document.getElementById('dashboard-summary');
    const recentTransactionsSection = document.getElementById('recent-transactions');
    const spendingChartSection = document.getElementById('spending-chart');

    let currentUser = null;

    // Initial Setup
    dashboardLoginPrompt.style.display = 'none';
    dashboardSummarySection.style.display = 'none';
    recentTransactionsSection.style.display = 'none';
    spendingChartSection.style.display = 'none';
    if(savingsGoalModal) savingsGoalModal.style.display = 'none';

    // Auth State Listener
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            dashboardLoginPrompt.style.display = 'none';
            dashboardSummarySection.style.display = 'block';
            recentTransactionsSection.style.display = 'block';
            spendingChartSection.style.display = 'block';

            if (usernameDisplay) {
                usernameDisplay.textContent = currentUser.displayName || currentUser.email.split('@')[0];
            }
            fetchDashboardData();
        } else {
            currentUser = null;
            // Clear UI on logout
        }
    });

    // --- Savings Goal Modal Logic ---
    if(setGoalBtn) setGoalBtn.addEventListener('click', () => {
        if(savingsGoalModal) showModal(savingsGoalModal);
    });
    if(savingsGoalModal) {
        savingsGoalModal.querySelector('.close-button').addEventListener('click', () => hideModal(savingsGoalModal));
        savingsGoalModal.addEventListener('click', (e) => {
            if (e.target === savingsGoalModal) hideModal(savingsGoalModal);
        });
    }
    if(savingsGoalForm) savingsGoalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;
        const amount = parseFloat(goalAmountInput.value);
        if (isNaN(amount) || amount <= 0) {
            showGoalMessage('Please enter a valid positive amount.', 'error');
            return;
        }

        try {
            await db.collection('users').doc(currentUser.uid).set({
                savingsGoal: amount
            }, { merge: true }); // Use merge to not overwrite other user data
            showGoalMessage('Savings goal updated successfully!', 'success');
            hideModal(savingsGoalModal);
            fetchDashboardData(); // Refresh data to show new goal
        } catch (error) {
            console.error("Error setting savings goal:", error);
            showGoalMessage('Failed to set savings goal.', 'error');
        }
    });
    
    function showGoalMessage(message, type = 'success') {
        goalFormMessage.textContent = message;
        goalFormMessage.className = `message ${type}`;
        goalFormMessage.style.display = 'block';
        setTimeout(() => { goalFormMessage.style.display = 'none'; }, 4000);
    }

    // --- Core Data Fetching Function ---
    async function fetchDashboardData() {
        if (!currentUser) return;

        let totalIncome = 0;
        let totalExpenses = 0;
        let totalSavings = 0;
        let totalWithdrawals = 0; // New variable for withdrawals
        let todayExpenditure = 0;
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const expenseCategories = {};

        try {
            // 1. Fetch user data (for savings goal)
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            const savingsGoal = userDoc.data()?.savingsGoal || 0;

            // 2. Fetch all transactions
            const snapshot = await db.collection('transactions').where('userId', '==', currentUser.uid).orderBy('date', 'desc').get();
            
            recentTransactionsTbody.innerHTML = '';
            let recentTransactionsCount = 0;

            snapshot.forEach(doc => {
                const transaction = doc.data();
                const amount = parseFloat(transaction.amount);
                const date = transaction.date.toDate();

                switch (transaction.type) {
                    case 'income':
                        totalIncome += amount;
                        break;
                    case 'expense':
                        totalExpenses += amount;
                        if (date >= startOfToday) {
                            todayExpenditure += amount;
                        }
                        const category = transaction.category || 'Uncategorized';
                        expenseCategories[category] = (expenseCategories[category] || 0) + amount;
                        break;
                    case 'savings':
                        totalSavings += amount;
                        break;
                    case 'withdraw': // Handle the new transaction type
                        totalWithdrawals += amount;
                        break;
                }

                if (recentTransactionsCount < 5) {
                    const row = recentTransactionsTbody.insertRow();
                    // Capitalize the first letter of the transaction type
                    const typeDisplay = transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1);
                    row.innerHTML = `
                        <td data-label="Date">${date.toLocaleDateString()}</td>
                        <td data-label="Type" class="${transaction.type}">${typeDisplay}</td>
                        <td data-label="Category">${transaction.category || '-'}</td>
                        <td data-label="Amount">TZS ${amount.toFixed(2)}</td>
                        <td data-label="Description" class="description-cell">${transaction.description || '-'}</td>
                    `;
                    recentTransactionsCount++;
                }
            });

            if (recentTransactionsCount === 0) {
                recentTransactionsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--secondary-text-color);">No recent transactions found.</td></tr>';
            }

            // 3. Update UI with new calculations
            const savingsBalance = totalSavings - totalWithdrawals;
            const currentBalance = totalIncome - totalExpenses - totalSavings + totalWithdrawals;

            animateValue(currentBalanceEl, 0, currentBalance, 1500);
            animateValue(totalIncomeEl, 0, totalIncome, 1500);
            animateValue(totalExpensesEl, 0, totalExpenses, 1500);
            animateValue(todayExpenditureEl, 0, todayExpenditure, 1500);

            // Update Savings UI
            if(savingsGoalEl) savingsGoalEl.textContent = `TZS ${savingsGoal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            animateValue(savingsProgressEl, 0, savingsBalance, 1500);
            
            // Update Progress Bar
            const progressPercent = (savingsGoal > 0) ? (savingsBalance / savingsGoal) * 100 : 0;
            if(progressBar) progressBar.style.width = `${Math.min(progressPercent, 100)}%`;
            if(savingsPercentage) savingsPercentage.textContent = `${progressPercent.toFixed(1)}% Complete`;


            renderSpendingChart(expenseCategories);

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        }
    }

    // --- Chart.js Integration & Animations (no changes here) ---
    function renderSpendingChart(data) { /* ... same as before ... */ }
    function getAdjustedFontSize(element, finalValue) { /* ... same as before ... */ }
    function animateValue(element, start, end, duration) { /* ... same as before ... */ }
    function showModal(modalElement) { /* ... same as before ... */ }
    function hideModal(modalElement) { /* ... same as before ... */ }
    function getAdjustedFontSize(element, finalValue) { if (!element || !element.parentElement) return 16; const parent = element.parentElement; const finalFormattedValue = `TZS ${finalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; const baseFontSize = parseFloat(window.getComputedStyle(element).fontSize); let currentFontSize = baseFontSize; const tempSpan = document.createElement('span'); tempSpan.style.fontSize = `${currentFontSize}px`; tempSpan.style.fontFamily = window.getComputedStyle(element).fontFamily; tempSpan.style.fontWeight = window.getComputedStyle(element).fontWeight; tempSpan.style.visibility = 'hidden'; tempSpan.style.position = 'absolute'; tempSpan.textContent = finalFormattedValue; document.body.appendChild(tempSpan); const parentStyles = window.getComputedStyle(parent); const availableWidth = parent.clientWidth - parseFloat(parentStyles.paddingLeft) - parseFloat(parentStyles.paddingRight); while (tempSpan.scrollWidth > availableWidth && currentFontSize > 12) { currentFontSize--; tempSpan.style.fontSize = `${currentFontSize}px`; } document.body.removeChild(tempSpan); return currentFontSize; }
    function animateValue(element, start, end, duration) { if (!element) return; const finalFontSize = getAdjustedFontSize(element, end); element.style.fontSize = `${finalFontSize}px`; let startTimestamp = null; const step = (timestamp) => { if (!startTimestamp) startTimestamp = timestamp; const progress = Math.min((timestamp - startTimestamp) / duration, 1); const currentValue = Math.floor(progress * (end - start) + start); element.textContent = `TZS ${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; if (progress < 1) { window.requestAnimationFrame(step); } else { element.textContent = `TZS ${end.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; } }; window.requestAnimationFrame(step); }
    function renderSpendingChart(data) { if (!spendingChartCanvas || typeof Chart === 'undefined') return; const labels = Object.keys(data); const amounts = Object.values(data); if (spendingChart) spendingChart.destroy(); const chartParent = spendingChartCanvas.parentElement; const existingP = chartParent.querySelector('p'); if (existingP) existingP.remove(); if (labels.length === 0) { const p = document.createElement('p'); p.textContent = 'No expense data to display for your transactions.'; p.style.textAlign = 'center'; p.style.color = 'var(--secondary-text-color)'; chartParent.appendChild(p); spendingChartCanvas.style.display = 'none'; return; } spendingChartCanvas.style.display = 'block'; spendingChart = new Chart(spendingChartCanvas, { type: 'doughnut', data: { labels: labels, datasets: [{ data: amounts, backgroundColor: ['#007BFF', '#28A745', '#DC3545', '#FFC107', '#17A2B8', '#6F42C1'], borderColor: 'var(--secondary-dark-bg)', borderWidth: 2, }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#E0E0E0', font: { family: "'Inter', sans-serif" } } }, tooltip: { callbacks: { label: function(context) { let label = context.label || ''; if (label) label += ': '; if (context.parsed !== null) { label += `TZS ${context.parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; } return label; } } } }, animation: { animateScale: true, animateRotate: true } } }); }
    function showModal(modalElement) { const mainContent = document.getElementById('main-content'); mainContent.classList.add('blur-background'); modalElement.style.display = 'flex'; setTimeout(() => { modalElement.classList.add('active'); }, 10); }
    function hideModal(modalElement) { const mainContent = document.getElementById('main-content'); if (!modalElement) return; modalElement.classList.remove('active'); setTimeout(() => { modalElement.style.display = 'none'; mainContent.classList.remove('blur-background'); }, 300); }
});