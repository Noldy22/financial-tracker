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
    const totalIncomeEl = document.getElementById('total-income'); // Added
    const totalExpensesEl = document.getElementById('total-expenses'); // Added
    const todayExpenditureEl = document.getElementById('today-expenditure');
    const monthlyIncomeEl = document.getElementById('monthly-income'); // Renamed from dashboard.js
    const monthlyExpensesEl = document.getElementById('monthly-expenses'); // Renamed from dashboard.js
    const savingsGoalEl = document.getElementById('savings-goal');
    const savingsProgressEl = document.getElementById('savings-progress');
    const recentTransactionsTbody = document.getElementById('recent-transactions-tbody');
    const spendingChartCanvas = document.getElementById('spendingChart');
    let spendingChart = null; // To hold the Chart.js instance

    // DOM elements for login/logout state management
    const dashboardLoginPrompt = document.getElementById('dashboard-login-prompt');
    const dashboardSummarySection = document.getElementById('dashboard-summary');
    const recentTransactionsSection = document.getElementById('recent-transactions');
    const spendingChartSection = document.getElementById('spending-chart');

    let currentUser = null; // To store the logged-in user object

    // --- Initial Setup: Hide content until auth state is known ---
    dashboardLoginPrompt.style.display = 'none';
    dashboardSummarySection.style.display = 'none';
    recentTransactionsSection.style.display = 'none';
    spendingChartSection.style.display = 'none';

    // --- Authentication State Listener ---
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            console.log("Dashboard: User logged in:", currentUser.uid);
            dashboardLoginPrompt.style.display = 'none'; // Hide login prompt
            dashboardSummarySection.style.display = 'block'; // Show summary
            recentTransactionsSection.style.display = 'block'; // Show recent transactions
            spendingChartSection.style.display = 'block'; // Show charts

            // Display username or email
            if (usernameDisplay) {
                usernameDisplay.textContent = currentUser.displayName || currentUser.email;
            }

            fetchDashboardData(); // Fetch and display data for logged-in user
        } else {
            currentUser = null;
            console.log("Dashboard: User logged out.");
            dashboardLoginPrompt.style.display = 'block'; // Show login prompt
            dashboardSummarySection.style.display = 'none'; // Hide summary
            recentTransactionsSection.style.display = 'none'; // Hide recent transactions
            spendingChartSection.style.display = 'none'; // Hide charts
            // Clear any displayed data
            if (currentBalanceEl) currentBalanceEl.textContent = 'TZS 0.00';
            if (totalIncomeEl) totalIncomeEl.textContent = 'TZS 0.00';
            if (totalExpensesEl) totalExpensesEl.textContent = 'TZS 0.00';
            if (todayExpenditureEl) todayExpenditureEl.textContent = 'TZS 0.00';
            if (monthlyIncomeEl) monthlyIncomeEl.textContent = 'TZS 0.00';
            if (monthlyExpensesEl) monthlyExpensesEl.textContent = 'TZS 0.00';
            if (savingsGoalEl) savingsGoalEl.textContent = 'TZS 0.00';
            if (savingsProgressEl) savingsProgressEl.textContent = 'TZS 0.00';
            if (recentTransactionsTbody) recentTransactionsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #A0AEC0;">Please log in to view transactions.</td></tr>';
            if (spendingChart) {
                spendingChart.destroy(); // Destroy chart when user logs out
                spendingChart = null;
            }
        }
    });

    // --- Function to Fetch and Display Dashboard Data ---
    async function fetchDashboardData() {
        if (!currentUser) {
            console.log("Dashboard: No user logged in, cannot fetch dashboard data.");
            return;
        }

        let currentBalance = 0;
        let totalIncome = 0;
        let totalExpenses = 0;
        let todayExpenditure = 0;
        let monthlyIncome = 0;
        let monthlyExpenses = 0;
        // Savings Goal/Progress would need separate logic/Firestore document

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // For spending chart data
        const expenseCategories = {};

        try {
            // Fetch all transactions for the current user, ordered by date
            const snapshot = await db.collection('transactions')
                .where('userId', '==', currentUser.uid)
                .orderBy('date', 'desc') // Needed for recent transactions and possibly for full balance calculation efficiency
                .get();

            let recentTransactionsCount = 0;
            recentTransactionsTbody.innerHTML = ''; // Clear recent transactions table

            snapshot.forEach(doc => {
                const transaction = doc.data();
                const amount = parseFloat(transaction.amount);
                const date = transaction.date.toDate(); // Convert Firestore Timestamp to Date object

                // Calculate Current Balance (Total Income - Total Expenses)
                if (transaction.type === 'income') {
                    currentBalance += amount;
                    totalIncome += amount;
                } else { // type === 'expense'
                    currentBalance -= amount;
                    totalExpenses += amount;
                }

                // Calculate Today's Expenditure
                if (date >= startOfToday && date <= endOfToday && transaction.type === 'expense') {
                    todayExpenditure += amount;
                }

                // Calculate Monthly Income/Expenses
                if (date >= startOfMonth && date <= endOfMonth) {
                    if (transaction.type === 'income') {
                        monthlyIncome += amount;
                    } else { // type === 'expense'
                        monthlyExpenses += amount;

                        // Aggregate for Spending Chart
                        const category = transaction.category || 'Uncategorized';
                        expenseCategories[category] = (expenseCategories[category] || 0) + amount;
                    }
                }

                // Display Recent Transactions (limit to 5)
                if (recentTransactionsCount < 5) {
                    const row = recentTransactionsTbody.insertRow();
                    row.innerHTML = `
                        <td>${date.toLocaleDateString()}</td>
                        <td class="${transaction.type}">${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}</td>
                        <td>${transaction.category || '-'}</td>
                        <td>TZS ${amount.toFixed(2)}</td>
                        <td>${transaction.description || '-'}</td>
                    `;
                    recentTransactionsCount++;
                }
            });

            // If no recent transactions, display a message
            if (recentTransactionsCount === 0) {
                recentTransactionsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #A0AEC0;">No recent transactions.</td></tr>';
            }


            // Update Dashboard Summary UI - Added null checks for robustness
            if (currentBalanceEl) currentBalanceEl.textContent = `TZS ${currentBalance.toFixed(2)}`;
            if (totalIncomeEl) totalIncomeEl.textContent = `TZS ${totalIncome.toFixed(2)}`;
            if (totalExpensesEl) totalExpensesEl.textContent = `TZS ${totalExpenses.toFixed(2)}`;
            if (todayExpenditureEl) todayExpenditureEl.textContent = `TZS ${todayExpenditure.toFixed(2)}`;
            if (monthlyIncomeEl) monthlyIncomeEl.textContent = `TZS ${monthlyIncome.toFixed(2)}`;
            if (monthlyExpensesEl) monthlyExpensesEl.textContent = `TZS ${monthlyExpenses.toFixed(2)}`;

            // Placeholder for Savings Goal/Progress - These would need user-defined goals in Firestore
            if (savingsGoalEl) savingsGoalEl.textContent = 'TZS 0.00'; // Default or fetch from user profile
            if (savingsProgressEl) savingsProgressEl.textContent = 'TZS 0.00'; // Calculate based on goal and income/expenses

            // Render Spending Chart
            renderSpendingChart(expenseCategories);

        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            // Display error messages on dashboard if elements exist
            if (currentBalanceEl) currentBalanceEl.textContent = 'Error';
            if (recentTransactionsTbody) recentTransactionsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #E74C3C;">Error loading transactions.</td></tr>';
            if (spendingChartCanvas) {
                 const chartParent = spendingChartCanvas.parentElement;
                 chartParent.innerHTML = `<p style="text-align: center; color: #E74C3C;">Error loading chart: ${error.message}. Please check console.</p>`;
            }
        }
    }

    // --- Chart.js Integration (Requires Chart.js library to be loaded in index.html) ---
    function renderSpendingChart(data) {
        if (!spendingChartCanvas || typeof Chart === 'undefined') {
            console.warn("Chart canvas not found or Chart.js not loaded.");
            if (spendingChartCanvas) {
                const chartParent = spendingChartCanvas.parentElement;
                chartParent.innerHTML = `<p style="text-align: center; color: #A0AEC0;">Chart.js library not loaded or canvas missing. Cannot display chart.</p>`;
            }
            return;
        }

        const labels = Object.keys(data);
        const amounts = Object.values(data);

        // Destroy existing chart if it exists
        if (spendingChart) {
            spendingChart.destroy();
        }

        if (labels.length === 0) {
            // Display a message if no expense data
            const chartParent = spendingChartCanvas.parentElement;
            chartParent.innerHTML = `<canvas id="spendingChart"></canvas><p style="text-align: center; color: #A0AEC0;">No expense data to display for the current month.</p>`;
            // Re-get the canvas as innerHTML replaced it
            spendingChartCanvas = document.getElementById('spendingChart');
            return;
        }

        spendingChart = new Chart(spendingChartCanvas, {
            type: 'pie', // Or 'doughnut', 'bar'
            data: {
                labels: labels,
                datasets: [{
                    data: amounts,
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
                        '#C70039', '#FFC300', '#DAF7A6', '#FF5733', '#C0C0C0'
                    ],
                    hoverBackgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
                        '#C70039', '#FFC300', '#DAF7A6', '#FF5733', '#C0C0C0'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Monthly Spending by Category'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += `TZS ${context.parsed.toFixed(2)}`;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }
});