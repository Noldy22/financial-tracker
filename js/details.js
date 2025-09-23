document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined' || typeof firebase.firestore === 'undefined') {
        console.error("Firebase SDKs not fully loaded. Ensure firebase-app-compat.js, firebase-auth-compat.js, and firebase-firestore-compat.js are linked before details.js.");
        return;
    }

    // --- Injecting animation styles directly into the document ---
    // This keeps the animation logic contained within this script.
    const style = document.createElement('style');
    style.textContent = `
        @keyframes row-fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .row-fade-in {
            animation: row-fade-in 0.4s ease-out forwards;
        }
    `;
    document.head.appendChild(style);


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
    const formTitle = document.getElementById('modal-form-title');
    const formSubmitButton = document.getElementById('modal-submit-button');

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
    transactionActionsSection.style.display = 'none';
    transactionListSection.style.display = 'none';
    transactionLoginPromptSection.style.display = 'none';

    // --- Authentication State Listener ---
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            transactionActionsSection.style.display = 'block';
            transactionListSection.style.display = 'block';
            transactionLoginPromptSection.style.display = 'none';
            fetchAndDisplayTransactions();
        } else {
            currentUser = null;
            transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--secondary-text-color);">Please log in to view and add transactions.</td></tr>';
            transactionActionsSection.style.display = 'none';
            transactionListSection.style.display = 'none';
            transactionLoginPromptSection.style.display = 'block';
            hideModal();
        }
    });

    function showMessage(message, type = 'success') {
        formMessage.textContent = message;
        formMessage.className = `message ${type}`;
        formMessage.style.display = 'block';
        setTimeout(() => { formMessage.style.display = 'none'; }, 5000);
    }

    function showModal() {
        mainContent.classList.add('blur-background');
        addTransactionModal.style.display = 'flex';
        setTimeout(() => { addTransactionModal.classList.add('active'); }, 10);
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
        if (formTitle) formTitle.textContent = 'Add New Transaction';
        if (formSubmitButton) formSubmitButton.textContent = 'Add Transaction';
        editingTransactionId = null;
        if (transactionDate) {
            transactionDate.valueAsDate = new Date();
        }
    }

    if(openAddTransactionModalBtn) openAddTransactionModalBtn.addEventListener('click', () => {
        resetTransactionForm();
        showModal();
    });
    if(closeButton) closeButton.addEventListener('click', hideModal);
    if(addTransactionModal) addTransactionModal.addEventListener('click', (e) => {
        if (e.target === addTransactionModal) hideModal();
    });

    if(transactionForm) transactionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            showMessage('You must be logged in to add/update transactions.', 'error');
            return;
        }
        const transactionData = {
            userId: currentUser.uid,
            type: transactionType.value,
            amount: parseFloat(transactionAmount.value),
            category: transactionCategory.value.trim(),
            date: firebase.firestore.Timestamp.fromDate(new Date(transactionDate.value)),
            description: transactionDescription.value.trim(),
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
            showMessage(`Failed to save transaction: ${error.message}`, 'error');
        }
    });

    async function fetchAndDisplayTransactions() {
        if (!currentUser) return;
        transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--secondary-text-color);">Fetching transactions...</td></tr>';
        let query = db.collection('transactions').where('userId', '==', currentUser.uid);
        if (filterType.value !== 'all') query = query.where('type', '==', filterType.value);
        if (filterStartDate.value) query = query.where('date', '>=', new Date(filterStartDate.value));
        if (filterEndDate.value) query = query.where('date', '<=', new Date(filterEndDate.value));
        query = query.orderBy('date', 'desc');

        try {
            const snapshot = await query.get();
            transactionsTbody.innerHTML = '';
            if (snapshot.empty) {
                transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--secondary-text-color);">No transactions found.</td></tr>';
                return;
            }
            snapshot.forEach((doc, index) => {
                const transaction = doc.data();
                const transactionId = doc.id;
                const row = transactionsTbody.insertRow();
                
                // Add the animation class with a staggered delay
                row.className = 'row-fade-in';
                row.style.animationDelay = `${index * 0.05}s`;

                row.innerHTML = `
                    <td data-label="Date">${transaction.date.toDate().toLocaleDateString()}</td>
                    <td data-label="Type" class="${transaction.type}">${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}</td>
                    <td data-label="Category">${transaction.category}</td>
                    <td data-label="Amount">TZS ${parseFloat(transaction.amount).toFixed(2)}</td>
                    <td data-label="Description" class="description-cell">${transaction.description || '-'}</td>
                    <td data-label="Actions" class="action-buttons">
                        <button class="edit-btn action-button" data-id="${transactionId}">Edit</button>
                        <button class="delete-btn action-button" data-id="${transactionId}">Delete</button>
                    </td>
                `;
                row.querySelector('.edit-btn').addEventListener('click', () => editTransaction(transactionId, transaction));
                row.querySelector('.delete-btn').addEventListener('click', () => deleteTransaction(transactionId));
            });
        } catch (error) {
            console.error("Error fetching transactions:", error);
            transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger-red);">Error loading transactions.</td></tr>';
        }
    }

    if(applyFiltersBtn) applyFiltersBtn.addEventListener('click', fetchAndDisplayTransactions);
    if(clearFiltersBtn) clearFiltersBtn.addEventListener('click', () => {
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
        transactionDate.valueAsDate = currentData.date.toDate();
        transactionDescription.value = currentData.description || '';
        if (formTitle) formTitle.textContent = 'Edit Transaction';
        if (formSubmitButton) formSubmitButton.textContent = 'Update Transaction';
        showModal();
    }

    async function deleteTransaction(id) {
        if (confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
            try {
                await db.collection('transactions').doc(id).delete();
                // We don't show a message here, the row will just disappear after refetch
                fetchAndDisplayTransactions();
            } catch (error) {
                console.error("Error deleting transaction:", error);
                alert(`Failed to delete transaction: ${error.message}`);
            }
        }
    }

    resetTransactionForm();
});