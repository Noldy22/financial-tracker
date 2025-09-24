document.addEventListener('DOMContentLoaded', () => {
    // Ensure Firebase and PDF libraries are loaded
    if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined' || typeof firebase.firestore === 'undefined') {
        console.error("Firebase SDKs not fully loaded.");
        return;
    }
    if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
        console.error("jsPDF or html2canvas library not loaded.");
        return;
    }
    const { jsPDF } = window.jspdf;


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

    // Main Page Elements
    const mainContent = document.getElementById('main-content');
    const transactionsTbody = document.getElementById('transactions-tbody');
    const openAddTransactionModalBtn = document.getElementById('open-add-transaction-modal');
    const printReportBtn = document.getElementById('print-report-btn');
    const filterType = document.getElementById('filter-type');
    const filterStartDate = document.getElementById('filter-start-date');
    const filterEndDate = document.getElementById('filter-end-date');
    const applyFiltersBtn = document.getElementById('apply-filters');
    const clearFiltersBtn = document.getElementById('clear-filters');
    const transactionActionsSection = document.getElementById('transaction-actions');
    const transactionListSection = document.getElementById('transaction-list');
    const transactionLoginPromptSection = document.getElementById('transaction-login-prompt');

    // Add/Edit Modal Elements
    const addTransactionModal = document.getElementById('add-transaction-modal');
    const transactionForm = document.getElementById('transaction-form');
    const closeButton = addTransactionModal.querySelector('.close-button');
    const transactionType = document.getElementById('transaction-type');
    const transactionAmount = document.getElementById('transaction-amount');
    const transactionCategory = document.getElementById('transaction-category');
    const transactionDate = document.getElementById('transaction-date');
    const transactionDescription = document.getElementById('transaction-description');
    const formMessage = document.getElementById('form-message');
    const formTitle = document.getElementById('modal-form-title');
    const formSubmitButton = document.getElementById('modal-submit-button');

    // Custom Confirmation Modal Elements
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalText = document.getElementById('confirm-modal-text');
    const confirmBtnOk = document.getElementById('confirm-btn-ok');
    const confirmBtnCancel = document.getElementById('confirm-btn-cancel');

    // Report Modal Elements
    const reportModal = document.getElementById('report-modal');
    const reportPreview = document.getElementById('report-preview');
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    const reportModalCloseBtn = reportModal.querySelector('.close-button');


    let currentUser = null;
    let editingTransactionId = null;
    let currentTransactions = []; // To store the currently displayed transactions

    // Initial setup
    addTransactionModal.style.display = 'none';
    if(confirmModal) confirmModal.style.display = 'none';
    if(reportModal) reportModal.style.display = 'none';
    mainContent.classList.remove('blur-background');
    transactionActionsSection.style.display = 'none';
    transactionListSection.style.display = 'none';
    transactionLoginPromptSection.style.display = 'none';

    // Authentication State Listener
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
            hideModal(addTransactionModal);
        }
    });

    // --- NEW: Function to scale the report preview ---
    function scaleReportPreview() {
        if (!reportModal || reportModal.style.display !== 'flex') return;

        const modalContent = document.getElementById('report-modal-content');
        const availableWidth = modalContent.clientWidth;
        
        // Reset scale to measure natural width accurately
        reportPreview.style.transform = 'scale(1)';
        const previewWidth = reportPreview.offsetWidth;

        if (previewWidth > availableWidth) {
            const scaleFactor = availableWidth / previewWidth;
            reportPreview.style.transform = `scale(${scaleFactor})`;
        } else {
            reportPreview.style.transform = 'scale(1)';
        }
    }
    
    // Generic Modal Functions
    function showModal(modalElement) {
        mainContent.classList.add('blur-background');
        modalElement.style.display = 'flex';
        setTimeout(() => { 
            modalElement.classList.add('active');
            // If it's the report modal, scale it
            if (modalElement === reportModal) {
                scaleReportPreview();
            }
        }, 10);
    }

    function hideModal(modalElement) {
        if (!modalElement) return;
        modalElement.classList.remove('active');
        setTimeout(() => {
            modalElement.style.display = 'none';
            mainContent.classList.remove('blur-background');
            if (modalElement === addTransactionModal) {
                resetTransactionForm();
            }
            // Reset report scale when hiding
            if (modalElement === reportModal) {
                reportPreview.style.transform = 'scale(1)';
            }
        }, 300);
    }
    
    if(openAddTransactionModalBtn) openAddTransactionModalBtn.addEventListener('click', () => {
        resetTransactionForm();
        showModal(addTransactionModal);
    });
    if(closeButton) closeButton.addEventListener('click', () => hideModal(addTransactionModal));
    if(addTransactionModal) addTransactionModal.addEventListener('click', (e) => {
        if (e.target === addTransactionModal) hideModal(addTransactionModal);
    });
    
    // Custom Confirmation Logic
    let resolveConfirm;
    const showConfirmation = (message) => {
        confirmModalText.textContent = message;
        showModal(confirmModal);
        return new Promise((resolve) => {
            resolveConfirm = resolve;
        });
    };

    if(confirmBtnOk) confirmBtnOk.addEventListener('click', () => {
        if (resolveConfirm) resolveConfirm(true);
        hideModal(confirmModal);
    });
    if(confirmBtnCancel) confirmBtnCancel.addEventListener('click', () => {
        if (resolveConfirm) resolveConfirm(false);
        hideModal(confirmModal);
    });

    // Transaction Data Functions
    async function fetchAndDisplayTransactions() {
        if (!currentUser) return;
        transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--secondary-text-color);">Fetching transactions...</td></tr>';
        
        let query = db.collection('transactions').where('userId', '==', currentUser.uid).orderBy('date', 'desc');

        try {
            const snapshot = await query.get();
            let transactions = [];
            snapshot.forEach(doc => {
                transactions.push({ id: doc.id, ...doc.data() });
            });

            const type = filterType.value;
            const startDate = filterStartDate.value ? new Date(filterStartDate.value) : null;
            if (startDate) startDate.setHours(0, 0, 0, 0); 
            const endDate = filterEndDate.value ? new Date(filterEndDate.value) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);

            const filteredTransactions = transactions.filter(transaction => {
                const transactionDate = transaction.date.toDate();
                const typeMatch = (type === 'all') || (transaction.type === type);
                const startDateMatch = !startDate || (transactionDate >= startDate);
                const endDateMatch = !endDate || (transactionDate <= endDate);
                return typeMatch && startDateMatch && endDateMatch;
            });

            currentTransactions = filteredTransactions; // Store for reporting

            transactionsTbody.innerHTML = '';
            if (filteredTransactions.length === 0) {
                transactionsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--secondary-text-color);">No transactions found for the selected filters.</td></tr>';
                return;
            }
            
            filteredTransactions.forEach((transaction, index) => {
                const transactionId = transaction.id;
                const row = transactionsTbody.insertRow();
                row.className = 'row-fade-in';
                row.style.animationDelay = `${index * 0.05}s`;
                const typeDisplay = transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1);
                row.innerHTML = `
                    <td data-label="Date">${transaction.date.toDate().toLocaleDateString()}</td>
                    <td data-label="Type" class="${transaction.type}">${typeDisplay}</td>
                    <td data-label="Category">${transaction.category}</td>
                    <td data-label="Amount">TZS ${parseFloat(transaction.amount).toFixed(2)}</td>
                    <td data-label="Description" class="description-cell">${transaction.description || '-'}</td>
                    <td data-label="Actions" class="action-buttons">
                        <button class="edit-btn" data-id="${transactionId}">Edit</button>
                        <button class="delete-btn" data-id="${transactionId}">Delete</button>
                    </td>
                `;
                const transactionData = { ...transaction };
                delete transactionData.id;
                row.querySelector('.edit-btn').addEventListener('click', () => editTransaction(transactionId, transactionData));
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
        showModal(addTransactionModal);
    }
    
    async function deleteTransaction(id) {
        const result = await showConfirmation('Are you sure you want to delete this transaction? This action cannot be undone.');
        
        if (result) {
            try {
                await db.collection('transactions').doc(id).delete();
                fetchAndDisplayTransactions();
            } catch (error) {
                console.error("Error deleting transaction:", error);
                alert(`Failed to delete transaction: ${error.message}`);
            }
        }
    }

    function showMessage(message, type = 'success') {
        formMessage.textContent = message;
        formMessage.className = `message ${type}`;
        formMessage.style.display = 'block';
        setTimeout(() => { formMessage.style.display = 'none'; }, 5000);
    }

    function resetTransactionForm() {
        if(!transactionForm) return;
        transactionForm.reset();
        if (formTitle) formTitle.textContent = 'Add New Transaction';
        if (formSubmitButton) formSubmitButton.textContent = 'Add Transaction';
        editingTransactionId = null;
        if (transactionDate) {
            transactionDate.valueAsDate = new Date();
        }
    }

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
            hideModal(addTransactionModal);
            fetchAndDisplayTransactions();
        } catch (error) {
            console.error("Error saving transaction:", error);
            showMessage(`Failed to save transaction: ${error.message}`, 'error');
        }
    });

    // --- Report Generation Logic ---
    function generateReportHTML(transactions) {
        let totalIncome = 0;
        let totalExpenses = 0;
        
        const tableRows = transactions.map(t => {
            const amount = parseFloat(t.amount);
            if (t.type === 'income') totalIncome += amount;
            if (t.type === 'expense') totalExpenses += amount;
            
            const typeDisplay = t.type.charAt(0).toUpperCase() + t.type.slice(1);
            return `
                <tr>
                    <td>${t.date.toDate().toLocaleDateString()}</td>
                    <td>${typeDisplay}</td>
                    <td>${t.category}</td>
                    <td>TZS ${amount.toFixed(2)}</td>
                </tr>
            `;
        }).join('');
        
        const netChange = totalIncome - totalExpenses;
        const dateRange = (filterStartDate.value && filterEndDate.value) 
            ? `${new Date(filterStartDate.value).toLocaleDateString()} to ${new Date(filterEndDate.value).toLocaleDateString()}`
            : 'All Time';

        const username = currentUser.displayName || currentUser.email.split('@')[0];

        return `
            <div class="report-header">
                <h2>${username}'s Financial Report</h2>
                <p><strong>Date Range:</strong> ${dateRange}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Category</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
            <div class="report-summary">
                <p><strong>Total Income:</strong> TZS ${totalIncome.toFixed(2)}</p>
                <p><strong>Total Expenses:</strong> TZS ${totalExpenses.toFixed(2)}</p>
                <p class="net-change"><strong>Net Change:</strong> TZS ${netChange.toFixed(2)}</p>
            </div>
            <div class="report-footer">
                <p>Report generated by Noldy22 Financial Tracker.</p>
            </div>
        `;
    }

    if(printReportBtn) printReportBtn.addEventListener('click', () => {
        if (currentTransactions.length === 0) {
            alert("No transactions to report. Please clear filters or add transactions.");
            return;
        }
        const reportHTML = generateReportHTML(currentTransactions);
        reportPreview.innerHTML = reportHTML;
        showModal(reportModal);
    });

    if(downloadPdfBtn) downloadPdfBtn.addEventListener('click', () => {
        const reportContent = document.getElementById('report-preview');
        
        // Temporarily reset scale for full-quality PDF capture
        reportContent.style.transform = 'scale(1)';
        
        html2canvas(reportContent, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;
            const imgHeight = pdfWidth / ratio;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);
            pdf.save('financial_report.pdf');
            
            // Re-apply scale for visual consistency after download
            scaleReportPreview();
        });
    });

    if(reportModalCloseBtn) reportModalCloseBtn.addEventListener('click', () => hideModal(reportModal));
    if(reportModal) reportModal.addEventListener('click', (e) => {
        if (e.target === reportModal) hideModal(reportModal);
    });

    // Add event listener to rescale report on window resize (e.g., mobile orientation change)
    window.addEventListener('resize', scaleReportPreview);

    resetTransactionForm();
});