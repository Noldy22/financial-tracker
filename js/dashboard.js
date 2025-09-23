document.addEventListener('DOMContentLoaded', () => {
    // Check if Firebase is initialized globally
    if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined' || typeof firebase.firestore === 'undefined') {
        console.error("Firebase SDKs not fully loaded. Ensure firebase-app-compat.js, firebase-auth-compat.js, and firebase-firestore-compat.js are linked before dashboard.js.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // DOM elements for Dashboard Summary
    const usernameDisplay = document.getElementById('username-display');
    const currentBalanceEl = document.getElementById('current-balance');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpensesEl = document.getElementById('total-expenses');
    const todayExpenditureEl = document.getElementById('today-expenditure');
    const savingsGoalEl = document.getElementById('savings-goal');
    const savingsProgressEl = document.getElementById('savings-progress');
    const recentTransactionsTbody = document.getElementById('recent-transactions-tbody');
    let spendingChartCanvas = document.getElementById('spendingChart');
    let spendingChart = null;

    // DOM elements for login/logout state management
    const dashboardLoginPrompt = document.getElementById('dashboard-login-prompt');
    const dashboardSummarySection = document.getElementById('dashboard-summary');
    const recentTransactionsSection = document.getElementById('recent-transactions');
    const spendingChartSection = document.getElementById('spending-chart');

    let currentUser = null;

    // --- Initial Setup ---
    dashboardLoginPrompt.style.display = 'none';
    dashboardSummarySection.style.display = 'none';
    recentTransactionsSection.style.display = 'none';
    spendingChartSection.style.display = 'none';

    // --- Authentication State Listener ---
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
            dashboardLoginPrompt.style.display = 'block';
            dashboardSummarySection.style.display = 'none';
            recentTransactionsSection.style.display = 'none';
            spendingChartSection.style.display = 'none';
            
            if (currentBalanceEl) currentBalanceEl.textContent = 'TZS 0.00';
            if (totalIncomeEl) totalIncomeEl.textContent = 'TZS 0.00';
            if (totalExpensesEl) totalExpensesEl.textContent = 'TZS 0.00';
            if (todayExpenditureEl) todayExpenditureEl.textContent = 'TZS 0.00';
            if (savingsGoalEl) savingsGoalEl.textContent = 'TZS 0.00';
            if (savingsProgressEl) savingsProgressEl.textContent = 'TZS 0.00';
            if (recentTransactionsTbody) recentTransactionsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--secondary-text-color);">Please log in to view transactions.</td></tr>';
            
            if (spendingChart) {
                spendingChart.destroy();
                spendingChart = null;
            }
        }
    });

    // --- Helper function to calculate the correct font size ---
    function getAdjustedFontSize(element, finalValue) {
        if (!element || !element.parentElement) return 16;
        const parent = element.parentElement;
        const finalFormattedValue = `TZS ${finalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const baseFontSize = parseFloat(window.getComputedStyle(element).fontSize);
        let currentFontSize = baseFontSize;
        const tempSpan = document.createElement('span');
        tempSpan.style.fontSize = `${currentFontSize}px`;
        tempSpan.style.fontFamily = window.getComputedStyle(element).fontFamily;
        tempSpan.style.fontWeight = window.getComputedStyle(element).fontWeight;
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.textContent = finalFormattedValue;
        document.body.appendChild(tempSpan);
        const parentStyles = window.getComputedStyle(parent);
        const availableWidth = parent.clientWidth - parseFloat(parentStyles.paddingLeft) - parseFloat(parentStyles.paddingRight);
        while (tempSpan.scrollWidth > availableWidth && currentFontSize > 12) {
            currentFontSize--;
            tempSpan.style.fontSize = `${currentFontSize}px`;
        }
        document.body.removeChild(tempSpan);
        return currentFontSize;
    }

    // --- Function to Animate Number Counting with auto-sized font ---
    function animateValue(element, start, end, duration) {
        if (!element) return;
        const finalFontSize = getAdjustedFontSize(element, end);
        element.style.fontSize = `${finalFontSize}px`;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const currentValue = Math.floor(progress * (end - start) + start);
            element.textContent = `TZS ${currentValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                element.textContent = `TZS ${end.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
        };
        window.requestAnimationFrame(step);
    }

    // --- Function to Fetch and Display Dashboard Data ---
    async function fetchDashboardData() {
        if (!currentUser) return;
        let totalIncome = 0;
        let totalExpenses = 0;
        let todayExpenditure = 0;
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const expenseCategories = {};

        try {
            const snapshot = await db.collection('transactions').where('userId', '==', currentUser.uid).orderBy('date', 'desc').get();
            let recentTransactionsCount = 0;
            if (recentTransactionsTbody) recentTransactionsTbody.innerHTML = '';

            snapshot.forEach(doc => {
                const transaction = doc.data();
                const amount = parseFloat(transaction.amount);
                const date = transaction.date.toDate();
                if (transaction.type === 'income') {
                    totalIncome += amount;
                } else {
                    totalExpenses += amount;
                    if (date >= startOfToday) {
                        todayExpenditure += amount;
                    }
                    const category = transaction.category || 'Uncategorized';
                    expenseCategories[category] = (expenseCategories[category] || 0) + amount;
                }

                // --- MODIFIED: Added data-label attributes to each <td> ---
                if (recentTransactionsTbody && recentTransactionsCount < 5) {
                    const row = recentTransactionsTbody.insertRow();
                    row.innerHTML = `
                        <td data-label="Date">${date.toLocaleDateString()}</td>
                        <td data-label="Type" class="${transaction.type}">${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}</td>
                        <td data-label="Category">${transaction.category || '-'}</td>
                        <td data-label="Amount">TZS ${amount.toFixed(2)}</td>
                        <td data-label="Description" class="description-cell">${transaction.description || '-'}</td>
                    `;
                    recentTransactionsCount++;
                }
            });

            if (recentTransactionsTbody && recentTransactionsCount === 0) {
                recentTransactionsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--secondary-text-color);">No recent transactions found.</td></tr>';
            }

            const currentBalance = totalIncome - totalExpenses;

            animateValue(currentBalanceEl, 0, currentBalance, 1500);
            animateValue(totalIncomeEl, 0, totalIncome, 1500);
            animateValue(totalExpensesEl, 0, totalExpenses, 1500);
            animateValue(todayExpenditureEl, 0, todayExpenditure, 1500);

            if (savingsGoalEl) savingsGoalEl.textContent = 'TZS 0.00';
            if (savingsProgressEl) savingsProgressEl.textContent = 'TZS 0.00';

            renderSpendingChart(expenseCategories);

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            if (currentBalanceEl) currentBalanceEl.textContent = 'Error';
            if (recentTransactionsTbody) recentTransactionsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger-red);">Error loading transactions.</td></tr>';
        }
    }

    // --- Chart.js Integration (No changes here) ---
    function renderSpendingChart(data) {
        if (!spendingChartCanvas || typeof Chart === 'undefined') return;
        const labels = Object.keys(data);
        const amounts = Object.values(data);
        if (spendingChart) spendingChart.destroy();
        const chartParent = spendingChartCanvas.parentElement;
        const existingP = chartParent.querySelector('p');
        if (existingP) existingP.remove();
        if (labels.length === 0) {
            const p = document.createElement('p');
            p.textContent = 'No expense data to display for your transactions.';
            p.style.textAlign = 'center';
            p.style.color = 'var(--secondary-text-color)';
            chartParent.appendChild(p);
            spendingChartCanvas.style.display = 'none';
            return;
        }
        spendingChartCanvas.style.display = 'block';
        spendingChart = new Chart(spendingChartCanvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: amounts,
                    backgroundColor: ['#007BFF', '#28A745', '#DC3545', '#FFC107', '#17A2B8', '#6F42C1'],
                    borderColor: 'var(--secondary-dark-bg)',
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'var(--primary-text-color)',
                            font: { family: "'Inter', sans-serif" }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                if (context.parsed !== null) {
                                    label += `TZS ${context.parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                }
                                return label;
                            }
                        }
                    }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }
});