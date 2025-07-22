document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined' || typeof firebase.firestore === 'undefined') {
        console.error("Firebase SDKs not fully loaded. Ensure firebase-app-compat.js, firebase-auth-compat.js, and firebase-firestore-compat.js are linked before details.js.");
        return;
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    // MODAL specific DOM elements
    const addTransactionModal = document.getElementById('add-transaction-modal');
    const openAddTransactionModalBtn = document.getElementById('open-add-transaction-modal');
    const closeButton = addTransactionModal.querySelector('.close-button');
    const mainContent = document.getElementById('main-content');

    // DOM elements for transaction form
    const transactionForm = document.getElementById('transaction-form');
    const transactionType = document.getElementById('transaction-type');
    const transactionAmount = document.getElementById('transaction-amount');
    const transactionCategory = document.getElementById('transaction-category');
    const transactionDate = document.getElementById('transaction-date');
    const transactionDescription = document.getElementById('transaction-description');
    const formMessage = document.getElementById('form-message');

    // **UPDATED DOM SELECTIONS**
    const formTitle = document.getElementById('modal-form-title'); // Now directly targeting by new ID
    const formSubmitButton = document.getElementById('modal-submit-button'); // Now directly targeting by new ID

    // DOM elements for transaction list
    const transactionsTbody = document.getElementById('transactions-tbody');
    const filterType = document.getElementById('filter-type');
    const filterStartDate = document.getElementById('filter-start-date');
    const filterEndDate = document.getElementById('filter-end-date');
    const applyFiltersBtn = document.getElementById('apply-filters');
    const clearFiltersBtn = document.getElementById('clear-filters');

    // Login/Logout sections
    const transactionActionsSection = document.getElementById('transaction-actions');
    const transactionListSection = document.getElementById('transaction-list');
    const transactionLoginPromptSection = document.getElementById('transaction-login-prompt');


    let currentUser = null;
    let editingTransactionId = null;

    // --- Initial setup ---
    addTransactionModal.style.display = 'none';
    mainContent.classList.remove('blur-background');
    // Hide all transaction-related sections by default until user state is known
    transactionActionsSection.style.display = 'none';
    transactionListSection.style.display = 'none';
    transactionLoginPromptSection.style.display = 'none';


    // --- Authentication State Listener ---
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            console.log("Details: User logged in:", currentUser.uid);
            transactionActionsSection.style.display = 'block'; // Show actions
            transactionListSection.style.display = 'block'; // Show list
            transactionLoginPromptSection.style.display = 'none'; // Hide login prompt
            fetchAndDisplayTransactions();
        } else {
            currentUser = null;
            console.log("Details: User logged out.");
            transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #A0AEC0;">Please log in to view and add transactions.</td></tr>';
            transactionActionsSection.style.display = 'none'; // Hide actions
            transactionListSection.style.display = 'none'; // Hide list
            transactionLoginPromptSection.style.display = 'block'; // Show login prompt
            hideModal();
        }
    });

    // ... (rest of the functions remain largely the same, but include the null checks for robustness) ...

    function showMessage(message, type = 'success') {
        formMessage.textContent = message;
        formMessage.className = `message ${type}`;
        formMessage.style.display = 'block';
        setTimeout(() => {
            formMessage.style.display = 'none';
        }, 5000);
    }

    function showModal() {
        mainContent.classList.add('blur-background');
        addTransactionModal.style.display = 'flex';
        setTimeout(() => {
            addTransactionModal.classList.add('active');
        }, 10);
    }

    function hideModal() {
        addTransactionModal.classList.remove('active');
        setTimeout(() => {
            addTransactionModal.style.display = 'none';
            mainContent.classList.remove('blur-background');
            formMessage.style.display = 'none';
            resetTransactionForm();
        }, 300);
    }

    function resetTransactionForm() {
        transactionForm.reset();
        // Ensure formTitle and formSubmitButton are not null before setting textContent
        if (formTitle) {
            formTitle.textContent = 'Add New Transaction';
        }
        if (formSubmitButton) {
            formSubmitButton.textContent = 'Add Transaction';
        }
        editingTransactionId = null;
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        // Ensure transactionDate is not null before setting its value
        if (transactionDate) {
            transactionDate.value = `${year}-${month}-${day}`;
        }
    }

    openAddTransactionModalBtn.addEventListener('click', () => {
        resetTransactionForm();
        showModal();
    });
    closeButton.addEventListener('click', hideModal);
    addTransactionModal.addEventListener('click', (e) => {
        if (e.target === addTransactionModal) {
            hideModal();
        }
    });

    transactionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            showMessage('You must be logged in to add/update transactions.', 'error');
            return;
        }

        const type = transactionType.value;
        const amount = parseFloat(transactionAmount.value);
        const category = transactionCategory.value.trim();
        const date = new Date(transactionDate.value);
        const description = transactionDescription.value.trim();

        if (isNaN(amount) || amount <= 0) {
            showMessage('Please enter a valid positive amount.', 'error');
            return;
        }
        if (!category) {
            showMessage('Please enter a category.', 'error');
            return;
        }
        if (isNaN(date.getTime())) {
            showMessage('Please select a valid date.', 'error');
            return;
        }

        const transactionData = {
            userId: currentUser.uid,
            type: type,
            amount: amount,
            category: category,
            date: firebase.firestore.Timestamp.fromDate(date),
            description: description,
        };

        try {
            if (editingTransactionId) {
                await db.collection('transactions').doc(editingTransactionId).update(transactionData);
                showMessage('Transaction updated successfully!', 'success');
            } else {
                transactionData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('transactions').add(transactionData);
                showMessage('Transaction added successfully!', 'success');
            }

            hideModal();
            fetchAndDisplayTransactions();
        } catch (error) {
            console.error("Error saving transaction:", error);
            showMessage('Failed to save transaction: ' + error.message, 'error');
        }
    });

    async function fetchAndDisplayTransactions() {
        if (!currentUser) return;

        transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #A0AEC0;">Fetching transactions...</td></tr>';

        let query = db.collection('transactions').where('userId', '==', currentUser.uid);

        const selectedType = filterType.value;
        if (selectedType !== 'all') {
            query = query.where('type', '==', selectedType);
        }

        const startDate = filterStartDate.value ? new Date(filterStartDate.value) : null;
        const endDate = filterEndDate.value ? new Date(filterEndDate.value) : null;

        if (startDate) {
            query = query.where('date', '>=', firebase.firestore.Timestamp.fromDate(startDate));
        }
        if (endDate) {
            const endOfDay = new Date(endDate);
            endOfDay.setHours(23, 59, 59, 999);
            query = query.where('date', '<=', firebase.firestore.Timestamp.fromDate(endOfDay));
        }

        query = query.orderBy('date', 'desc');

        try {
            const snapshot = await query.get();
            transactionsTbody.innerHTML = '';

            if (snapshot.empty) {
                transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #A0AEC0;">No transactions found.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const transaction = doc.data();
                const transactionId = doc.id;
                const dateObj = transaction.date.toDate();

                const row = transactionsTbody.insertRow();
                row.innerHTML = `
                    <td>${dateObj.toLocaleDateString()}</td>
                    <td class="${transaction.type}">${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}</td>
                    <td>${transaction.category}</td>
                    <td>TZS ${parseFloat(transaction.amount).toFixed(2)}</td>
                    <td>${transaction.description || '-'}</td>
                    <td class="action-buttons">
                        <button class="edit-btn" data-id="${transactionId}">Edit</button>
                        <button class="delete-btn" data-id="${transactionId}">Delete</button>
                    </td>
                `;

                row.querySelector('.edit-btn').addEventListener('click', () => editTransaction(transactionId, transaction));
                row.querySelector('.delete-btn').addEventListener('click', () => deleteTransaction(transactionId));
            });

        } catch (error) {
            console.error("Error fetching transactions:", error);
            transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #E74C3C;">Error loading transactions.</td></tr>';
        }
    }

    applyFiltersBtn.addEventListener('click', fetchAndDisplayTransactions);
    clearFiltersBtn.addEventListener('click', () => {
        filterType.value = 'all';
        filterStartDate.value = '';
        filterEndDate.value = '';
        fetchAndDisplayTransactions();
    });

    function editTransaction(id, currentData) {
        editingTransactionId = id;

        transactionType.value = currentData.type;
        transactionAmount.value = currentData.amount;
        transactionCategory.value = currentData.category;
        const dateObj = currentData.date.toDate();
        const year = dateObj.getFullYear();
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        transactionDate.value = `${year}-${month}-${day}`;
        transactionDescription.value = currentData.description || '';

        if (formTitle) {
            formTitle.textContent = 'Edit Transaction';
        }
        if (formSubmitButton) {
            formSubmitButton.textContent = 'Update Transaction';
        }

        showModal();
    }

    async function deleteTransaction(id) {
        if (confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
            try {
                await db.collection('transactions').doc(id).delete();
                showMessage('Transaction deleted successfully!', 'success');
                fetchAndDisplayTransactions();
            } catch (error) {
                console.error("Error deleting transaction:", error);
                showMessage('Failed to delete transaction: ' + error.message, 'error');
            }
        }
    }

    resetTransactionForm();
});