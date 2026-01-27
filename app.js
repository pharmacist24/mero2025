/* Meropenem Tracking System JavaScript
 * Baghdad Teaching Hospital Pharmacy Department
 * Full functionality including IndexedDB storage, Google Sheets sync, and responsive design
 */

// ============================================
// CONFIGURATION
// ============================================

// Update this URL with your deployed Google Apps Script URL
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx5l4v4g9cOZaJDQMrcx4ircKQR_vyvQOiCoKmw9x6Ixmw0z6lblsOPwvqjr2Wd-5CX/exec';

// Database Configuration
const DB_NAME = 'MeropenemTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'submissions';

// ============================================
// STATE MANAGEMENT
// ============================================

let db = null;
let records = [];

// ============================================
// DATABASE OPERATIONS
// ============================================

/**
 * Initialize IndexedDB
 */
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
            showToast('error', 'Failed to initialize database');
            reject(request.error);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                objectStore.createIndex('synced', 'synced', { unique: false });
                objectStore.createIndex('createdAt', 'createdAt', { unique: false });
                objectStore.createIndex('patientName', 'patientName', { unique: false });
            }
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database initialized successfully');
            resolve(db);
        };
        
        request.onerror = (event) => {
            console.error('Database initialization error:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Get database instance
 */
function getDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

/**
 * Add new record to database
 */
async function addRecord(record) {
    try {
        const database = await getDB();
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.add(record);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const newRecord = { ...record, id: request.result };
                records.unshift(newRecord);
                resolve(newRecord);
            };
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Failed to add record:', error);
        throw error;
    }
}

/**
 * Update existing record
 */
async function updateRecord(id, updates) {
    try {
        const database = await getDB();
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        
        const getRequest = objectStore.get(id);
        
        getRequest.onsuccess = () => {
            const data = getRequest.result;
            if (data) {
                const updatedRecord = { ...data, ...updates };
                const putRequest = objectStore.put(updatedRecord);
                
                putRequest.onsuccess = () => {
                    console.log('Record updated:', id);
                    const index = records.findIndex(r => r.id === id);
                    if (index !== -1) {
                        records[index] = updatedRecord;
                    }
                };
                
                putRequest.onerror = (event) => {
                    console.error('Failed to update record:', event.target.error);
                };
            }
        };
        
        getRequest.onerror = (event) => {
            console.error('Failed to get record:', event.target.error);
        };
    } catch (error) {
        console.error('Failed to update record:', error);
        throw error;
    }
}

/**
 * Delete record
 */
async function deleteRecord(id) {
    return new Promise(async (resolve, reject) => {
        try {
            const database = await getDB();
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.delete(id);
            
            request.onsuccess = () => {
                console.log('Record deleted:', id);
                records = records.filter(r => r.id !== id);
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('Failed to delete record:', event.target.error);
                reject(event.target.error);
            };
        } catch (error) {
            console.error('Delete record error:', error);
            reject(error);
        }
    });
}

/**
 * Get all records
 */
async function getAllRecords() {
    try {
        const database = await getDB();
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Failed to get records:', error);
        throw error;
    }
}

/**
 * Get unsynced records
 */
async function getUnsyncedRecords() {
    try {
        const database = await getDB();
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const index = objectStore.index('synced');
        const request = index.getAll(false);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error('Failed to get unsynced records:', error);
        throw error;
    }
}

/**
 * Load records from database
 */
async function loadRecords() {
    try {
        records = await getAllRecords();
        updateStats();
        displayRecords();
        updatePendingBanner();
    } catch (error) {
        console.error('Failed to load records:', error);
        showToast('error', 'Failed to load records');
    }
}

// ============================================
// GOOGLE SHEETS INTEGRATION
// ============================================

/**
 * Send record to Google Sheets
 */
async function syncToGoogleSheets(record) {
    try {
        const recordData = {
            timestamp: record.createdAt,
            patientName: record.patientName,
            age: record.age,
            gender: record.gender,
            diagnosis: record.diagnosis,
            meropenem1gQuantity: record.meropenem1gQuantity,
            meropenem0_5gQuantity: record.meropenem0_5gQuantity,
            frequency: record.frequency,
            duration: record.duration,
            pharmacistId: record.pharmacistId || '',
            allergyTest: record.allergyTest,
            syncStatus: 'Synced',
        };
        
        console.log('Sending to Google Sheets:', recordData);
        
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(recordData)
        });
        
        console.log('Response received:', response.status);
        
        // Assume success if no error thrown (no-cors mode can't read response)
        return true;
    } catch (error) {
        console.error('Sync error:', error);
        return false;
    }
}

/**
 * Sync a specific record
 */
async function syncRecord(record) {
    try {
        const synced = await syncToGoogleSheets(record);
        if (synced) {
            await updateRecord(record.id, {
                synced: true,
                syncedAt: new Date().toISOString()
            });
            console.log('Record synced successfully:', record.id);
        }
        return synced;
    } catch (error) {
        console.error('Sync record error:', error);
        return false;
    }
}

/**
 * Sync all pending records to Google Sheets
 */
async function syncAllRecords() {
    try {
        const unsyncedRecords = await getUnsyncedRecords();
        
        if (unsyncedRecords.length === 0) {
            showToast('info', 'No pending records to sync');
            return;
        }
        
        showToast('info', `Syncing ${unsyncedRecords.length} record(s)...`);
        
        let syncedCount = 0;
        for (const record of unsyncedRecords) {
            const synced = await syncRecord(record);
            if (synced) {
                syncedCount++;
            }
            // Small delay between syncs to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        await loadRecords();
        
        if (syncedCount > 0) {
            showToast('success', `${syncedCount} record(s) synced successfully`);
        } else {
            showToast('warning', 'Failed to sync records. Please try again.');
        }
    } catch (error) {
        console.error('Sync all records error:', error);
        showToast('error', 'Failed to sync records');
    }
}

// ============================================
// FORM HANDLING
// ============================================

/**
 * Validate form data
 */
function validateForm() {
    const errors = [];
    
    const patientName = document.getElementById('patientName').value.trim();
    const age = parseInt(document.getElementById('age').value) || 0;
    const gender = document.getElementById('gender').value;
    const diagnosis = document.getElementById('diagnosis').value;
    const allergyTest = document.getElementById('allergyTest').value;
    const frequency = document.getElementById('frequency').value;
    const duration = parseInt(document.getElementById('duration').value) || 0;
    const meropenem1gQuantity = parseInt(document.getElementById('meropenem1gQuantity').value) || 0;
    const meropenem0_5gQuantity = parseInt(document.getElementById('meropenem0_5gQuantity').value) || 0;
    
    if (!patientName) {
        errors.push('Patient name is required');
    }
    
    if (!age || age <= 0) {
        errors.push('Please enter a valid age');
    }
    
    if (!gender) {
        errors.push('Please select a gender');
    }
    
    if (!diagnosis) {
        errors.push('Please select a diagnosis');
    }
    
    if (!allergyTest) {
        errors.push('Please select allergy test result');
    }
    
    if (!frequency) {
        errors.push('Please select a frequency');
    }
    
    if (!duration || duration <= 0) {
        errors.push('Please enter a valid duration in days');
    }
    
    const totalAmount = meropenem1gQuantity + (meropenem0_5gQuantity * 0.5);
    
    if (totalAmount === 0) {
        errors.push('Please dispense at least one vial');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Get form data
 */
function getFormData() {
    const meropenem1gQuantity = parseInt(document.getElementById('meropenem1gQuantity').value) || 0;
    const meropenem0_5gQuantity = parseInt(document.getElementById('meropenem0_5gQuantity').value) || 0;
    
    return {
        patientName: document.getElementById('patientName').value.trim(),
        age: parseInt(document.getElementById('age').value) || 0,
        gender: document.getElementById('gender').value,
        diagnosis: document.getElementById('diagnosis').value,
        allergyTest: document.getElementById('allergyTest').value,
        meropenem1gQuantity: meropenem1gQuantity,
        meropenem0_5gQuantity: meropenem0_5gQuantity,
        frequency: document.getElementById('frequency').value,
        duration: parseInt(document.getElementById('duration').value) || 0,
        pharmacistId: document.getElementById('pharmacistId').value.trim(),
        totalAmount: meropenem1gQuantity + (meropenem0_5gQuantity * 0.5),
    };
}

/**
 * Calculate total meropenem amount
 */
function calculateTotalAmount() {
    const meropenem1gQuantity = parseInt(document.getElementById('meropenem1gQuantity').value) || 0;
    const meropenem0_5gQuantity = parseInt(document.getElementById('meropenem0_5gQuantity').value) || 0;
    return meropenem1gQuantity + (meropenem0_5gQuantity * 0.5);
}

/**
 * Update total amount display
 */
function updateTotalAmount() {
    const total = calculateTotalAmount();
    const meropenem1gQuantity = parseInt(document.getElementById('meropenem1gQuantity').value) || 0;
    const meropenem0_5gQuantity = parseInt(document.getElementById('meropenem0_5gQuantity').value) || 0;
    
    document.getElementById('totalAmountDisplay').textContent = total.toFixed(1) + ' g';
    document.getElementById('total1gVials').textContent = meropenem1gQuantity;
    document.getElementById('total05gVials').textContent = meropenem0_5gQuantity;
}

/**
 * Reset form
 */
function resetForm() {
    document.getElementById('recordForm').reset();
    updateTotalAmount();
}

/**
 * Submit record
 */
async function submitRecord(event) {
    event.preventDefault();
    
    // Validate form
    const validation = validateForm();
    if (!validation.isValid) {
        showToast('error', validation.errors[0] || 'Please fill in all required fields');
        return;
    }
    
    // Create record object
    const formData = getFormData();
    const record = {
        ...formData,
        createdAt: new Date().toISOString(),
        synced: false,
        syncedAt: null
    };
    
    // Set submitting state
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    
    try {
        // Save to IndexedDB
        const newRecord = await addRecord(record);
        
        // Try to sync to Google Sheets if online
        if (navigator.onLine) {
            showToast('success', 'Record saved. Syncing to Google Sheets...');
            const synced = await syncRecord(newRecord);
            if (synced) {
                showToast('success', 'Record synced to Google Sheets');
            } else {
                showToast('info', 'Record saved locally. Will sync when possible');
            }
        } else {
            showToast('info', 'Record saved locally. Will sync when online');
        }
        
        updateStats();
        updatePendingBanner();
        
        // Go to records list
        resetForm();
        showPage('records');
    } catch (error) {
        console.error('Submit error:', error);
        showToast('error', 'Failed to submit record');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Submit Record';
    }
}

// ============================================
// UI UPDATES
// ============================================

/**
 * Show page
 */
function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show requested page
    const targetPage = document.getElementById(pageName + 'Page');
    if (targetPage) {
        targetPage.classList.add('active');
        
        // Update page content based on current page
        if (pageName === 'record') {
            updateTotalAmount();
        } else if (pageName === 'records') {
            displayRecords();
        } else if (pageName === 'dashboard') {
            updateDashboardCharts();
            updateDashboardStats();
        }
    }
}

/**
 * Display records in table
 */
function displayRecords() {
    const filterStatus = document.getElementById('filterStatus')?.value || 'all';
    const searchQuery = document.getElementById('searchInput')?.value?.toLowerCase()?.trim() || '';
    
    let filteredRecords = [...records];
    
    // Apply status filter
    if (filterStatus !== 'all') {
        const isSynced = filterStatus === 'synced';
        filteredRecords = records.filter(r => r.synced === isSynced);
    }
    
    // Apply search filter
    if (searchQuery) {
        filteredRecords = filteredRecords.filter(r =>
            r.patientName.toLowerCase().includes(searchQuery) ||
            r.diagnosis.toLowerCase().includes(searchQuery)
        );
    }
    
    // Sort by date (newest first)
    filteredRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Update table
    const tbody = document.getElementById('recordsBody');
    
    if (!tbody) return;
    
    if (filteredRecords.length === 0) {
        tbody.innerHTML = `
            <tr id="noRecordsRow">
                <td colspan="9" style="text-align: center; padding: 2rem; color: #64748b;">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                    <div style="font-size: 0.9rem;">No records found</div>
                </td>
            </tr>
        `;
    } else {
        tbody.innerHTML = filteredRecords.map(record => {
            const isSynced = record.synced;
            const badgeClass = isSynced ? 'success' : 'pending';
            const badgeText = isSynced ? '✓ Synced' : '⏳ Pending';
            
            return `
                <tr>
                    <td>${formatDate(record.createdAt)}</td>
                    <td>
                        <div style="font-weight: 600;">${record.patientName}</div>
                    </td>
                    <td>${record.age}</td>
                    <td>${record.gender}</td>
                    <td>${record.diagnosis}</td>
                    <td>${record.allergyTest === 'Yes' ? '⚠ Yes' : '✓ No'}</td>
                    <td>${record.totalAmount.toFixed(1)}g</td>
                    <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                    <td>
                        <button class="btn btn-danger" style="padding: 0.5rem;" onclick="deleteRecordHandler(${record.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    updateStats();
}

/**
 * Delete record handler
 */
async function deleteRecordHandler(id) {
    if (!confirm('Are you sure you want to delete this record?')) {
        return;
    }
    
    try {
        await deleteRecord(id);
        showToast('success', 'Record deleted successfully');
        await loadRecords();
        displayRecords();
    } catch (error) {
        console.error('Delete error:', error);
        showToast('error', 'Failed to delete record');
    }
}

/**
 * Update stats display
 */
function updateStats() {
    const total = records.length;
    const synced = records.filter(r => r.synced).length;
    const pending = records.filter(r => !r.synced).length;
    const totalMeropenem = records.reduce((sum, r) => sum + r.totalAmount, 0).toFixed(1);
    
    const totalRecordsEl = document.getElementById('totalRecords');
    const syncedRecordsEl = document.getElementById('syncedRecords');
    const totalMeropenemEl = document.getElementById('totalMeropenem');
    const pendingRecordsEl = document.getElementById('pendingRecords');
    
    if (totalRecordsEl) totalRecordsEl.textContent = total;
    if (syncedRecordsEl) syncedRecordsEl.textContent = synced;
    if (totalMeropenemEl) totalMeropenemEl.textContent = totalMeropenem + 'g';
    if (pendingRecordsEl) pendingRecordsEl.textContent = pending;
}

/**
 * Update dashboard stats
 */
function updateDashboardStats() {
    const total = records.length;
    const synced = records.filter(r => r.synced).length;
    const pending = records.filter(r => !r.synced).length;
    const totalMeropenem = records.reduce((sum, r) => sum + r.totalAmount, 0).toFixed(1);
    
    const dashTotalRecordsEl = document.getElementById('dashTotalRecords');
    const dashSyncedRecordsEl = document.getElementById('dashSyncedRecords');
    const dashTotalAmountEl = document.getElementById('dashTotalAmount');
    const dashPendingCountEl = document.getElementById('dashPendingCount');
    
    if (dashTotalRecordsEl) dashTotalRecordsEl.textContent = total;
    if (dashSyncedRecordsEl) dashSyncedRecordsEl.textContent = synced;
    if (dashTotalAmountEl) dashTotalAmountEl.textContent = totalMeropenem + 'g';
    if (dashPendingCountEl) dashPendingCountEl.textContent = pending;
}

/**
 * Update pending banner
 */
function updatePendingBanner() {
    const pending = records.filter(r => !r.synced).length;
    const banner = document.getElementById('pendingBanner');
    const countElement = document.getElementById('pendingCount');
    
    if (pending > 0) {
        banner.classList.add('visible');
        countElement.textContent = pending;
    } else {
        banner.classList.remove('visible');
    }
}

/**
 * Update dashboard charts
 */
function updateDashboardCharts() {
    updateDiagnosisChart();
    updateGenderChart();
}

/**
 * Update diagnosis chart
 */
function updateDiagnosisChart() {
    const diagnosisCounts = {};
    
    records.forEach(r => {
        diagnosisCounts[r.diagnosis] = (diagnosisCounts[r.diagnosis] || 0) + 1;
    });
    
    const maxCount = Math.max(...Object.values(diagnosisCounts), 1);
    const sortedDiagnoses = Object.entries(diagnosisCounts).sort((a, b) => b[1] - a[1]);
    
    const chartContainer = document.getElementById('diagnosisChart');
    
    if (!chartContainer) return;
    
    if (Object.keys(diagnosisCounts).length === 0) {
        chartContainer.innerHTML = '<p style="text-align: center; color: #64748b; padding: 2rem;">No data to display</p>';
        return;
    }
    
    chartContainer.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th style="width: 40%;">Diagnosis</th>
                    <th style="width: 15%;">Count</th>
                    <th style="width: 20%;">Percentage</th>
                    <th style="width: 25%;">Bar</th>
                </tr>
            </thead>
            <tbody>
                ${sortedDiagnoses.map(([diagnosis, count]) => {
                    const percentage = ((count / records.length) * 100).toFixed(1);
                    const barWidth = (count / maxCount) * 100;
                    
                    return `
                        <tr>
                            <td>${diagnosis}</td>
                            <td>${count}</td>
                            <td>${percentage}%</td>
                            <td>
                                <div style="background: linear-gradient(90deg, #3b82f6, #2563eb); width: ${barWidth}%; height: 1.5rem; border-radius: 0.5rem; transition: width 0.3s ease; min-width: 4px;"></div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Update gender chart
 */
function updateGenderChart() {
    const genderCounts = { Male: 0, Female: 0, Other: 0 };
    
    records.forEach(r => {
        if (genderCounts.hasOwnProperty(r.gender)) {
            genderCounts[r.gender]++;
        }
    });
    
    const total = records.length;
    const chartContainer = document.getElementById('genderChart');
    
    if (!chartContainer) return;
    
    if (total === 0) {
        chartContainer.innerHTML = '<p style="text-align: center; color: #64748b; padding: 2rem;">No data to display</p>';
        return;
    }
    
    const maxCount = Math.max(...Object.values(genderCounts), 1);
    
    chartContainer.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th style="width: 40%;">Gender</th>
                    <th style="width: 15%;">Count</th>
                    <th style="width: 20%;">Percentage</th>
                    <th style="width: 25%;">Bar</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(genderCounts).map(([gender, count]) => {
                    const percentage = ((count / total) * 100).toFixed(1);
                    const barWidth = (count / maxCount) * 100;
                    
                    return `
                        <tr>
                            <td>${gender}</td>
                            <td>${count}</td>
                            <td>${percentage}%</td>
                            <td>
                                <div style="background: linear-gradient(90deg, #8b5cf6, #7c3aed); width: ${barWidth}%; height: 1.5rem; border-radius: 0.5rem; transition: width 0.3s ease; min-width: 4px;"></div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// ============================================
// EXPORT TO CSV
// ============================================

/**
 * Export records to CSV
 */
function exportToCSV() {
    if (records.length === 0) {
        showToast('info', 'No records to export');
        return;
    }
    
    const headers = ['Date', 'Patient Name', 'Age', 'Gender', 'Diagnosis', 'Allergy', 'Total Amount (g)', 'Status', 'Frequency', 'Duration (days)', 'Pharmacist ID'];
    
    let csv = headers.join(',') + '\n';
    
    records.forEach(record => {
        csv += [
            formatDate(record.createdAt),
            `"${record.patientName}"`,
            record.age,
            record.gender,
            `"${record.diagnosis}"`,
            record.allergyTest,
            record.totalAmount.toFixed(1),
            record.synced ? 'Synced' : 'Pending',
            record.frequency,
            record.duration,
            record.pharmacistId || ''
        ].join(',') + '\n';
    });
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meropenem_records_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('success', 'Records exported to CSV');
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

/**
 * Show toast notification
 */
function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch(type) {
        case 'success':
            icon = '✓';
            break;
        case 'error':
            icon = '✗';
            break;
        case 'warning':
            icon = '⚠';
            break;
        default:
            icon = 'ⓘ';
    }
    
    toast.innerHTML = `
        <div class="toast-title">${icon} ${type.charAt(0).toUpperCase() + type.slice(1)}:</div>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out forwards';
        setTimeout(() => {
            if (container && container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================
// CONNECTION STATUS
// ============================================

/**
 * Update connection status display
 */
function updateConnectionStatus() {
    const statusBadge = document.getElementById('connectionStatus');
    const connectionIcon = document.getElementById('connectionIcon');
    const connectionText = document.getElementById('connectionText');
    const homeSyncStatus = document.getElementById('homeSyncStatus');
    
    if (navigator.onLine) {
        if (statusBadge) statusBadge.className = 'connection-status online';
        if (connectionIcon) connectionIcon.textContent = '●';
        if (connectionText) connectionText.textContent = 'Online';
        if (homeSyncStatus) homeSyncStatus.textContent = 'Synced';
    } else {
        if (statusBadge) statusBadge.className = 'connection-status offline';
        if (connectionIcon) connectionIcon.textContent = '●';
        if (connectionText) connectionText.textContent = 'Offline';
        if (homeSyncStatus) homeSyncStatus.textContent = 'Local';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Listen for connection changes
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    // Listen for input changes to update total
    const inputElements = ['meropenem1gQuantity', 'meropenem0_5gQuantity'];
    inputElements.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', updateTotalAmount);
        }
    });
    
    // Listen for search input changes
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', displayRecords);
    }
    
    // Listen for filter changes
    const filterSelect = document.getElementById('filterStatus');
    if (filterSelect) {
        filterSelect.addEventListener('change', displayRecords);
    }
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize app
 */
async function initApp() {
    const loadingScreen = document.getElementById('loadingScreen');
    const app = document.getElementById('app');
    
    try {
        // Initialize database
        await initDB();
        
        // Load records
        await loadRecords();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update connection status
        updateConnectionStatus();
        
        // Show home page
        showPage('home');
        
        // Hide loading screen and show app
        setTimeout(() => {
            if (loadingScreen) loadingScreen.style.display = 'none';
            if (app) app.style.display = 'block';
        }, 500);
        
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showToast('error', 'Failed to initialize app. Please refresh the page.');
        
        // Still show app even if there's an error
        setTimeout(() => {
            if (loadingScreen) loadingScreen.style.display = 'none';
            if (app) app.style.display = 'block';
        }, 500);
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Export functions for global access
window.showPage = showPage;
window.submitRecord = submitRecord;
window.resetForm = resetForm;
window.deleteRecordHandler = deleteRecordHandler;
window.syncAllRecords = syncAllRecords;
window.exportToCSV = exportToCSV;
window.updateTotalAmount = updateTotalAmount;
