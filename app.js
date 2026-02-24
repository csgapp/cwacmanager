// app.js - Complete Enhanced Version with Firebase Cloud Syncing, Draggable Sync Buttons,
// Registration Code System with Device Fingerprinting, and Admin Registration Dashboard

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    // ========== FIREBASE CONFIGURATION ==========
    const firebaseConfig = {
        apiKey: "AIzaSyBh_UArb8QhTrgOJh38pL8ZCrGrrcwKToc",
        authDomain: "cwacmanager-cedd6.firebaseapp.com",
        projectId: "cwacmanager-cedd6",
        storageBucket: "cwacmanager-cedd6.firebasestorage.app",
        messagingSenderId: "986970274761",
        appId: "1:986970274761:web:006859e6487ae9ae36c618"
    };
    
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    
    // Enable offline persistence for field staff
    db.enablePersistence({
        synchronizeTabs: true
    }).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Persistence failed - multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.log('Persistence not supported by browser');
        }
    });
    
    // ========== DEVICE FINGERPRINTING SYSTEM ==========
    
    // Generate a unique device fingerprint
    async function generateDeviceFingerprint() {
        const components = [];
        
        // Screen properties
        components.push(screen.width + 'x' + screen.height);
        components.push(screen.colorDepth);
        components.push(screen.availWidth + 'x' + screen.availHeight);
        
        // Browser and OS info
        components.push(navigator.userAgent);
        components.push(navigator.language);
        components.push(navigator.platform);
        components.push(navigator.hardwareConcurrency || 'unknown');
        
        // Timezone
        components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
        
        // Touch support
        components.push('touch:' + ('ontouchstart' in window));
        
        // WebGL info if available
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
                    components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                }
            }
        } catch (e) {
            console.log('WebGL fingerprinting not available');
        }
        
        // Audio fingerprint (simplified)
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            components.push(audioContext.sampleRate || 'unknown');
        } catch (e) {
            console.log('Audio fingerprinting not available');
        }
        
        // Check for stored fingerprint
        let fingerprint = localStorage.getItem('device_fingerprint');
        
        if (!fingerprint) {
            // Create hash of components
            const fingerprintString = components.join('|||');
            const encoder = new TextEncoder();
            const data = encoder.encode(fingerprintString);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            fingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // Store the fingerprint
            localStorage.setItem('device_fingerprint', fingerprint);
            localStorage.setItem('device_first_seen', new Date().toISOString());
        }
        
        return fingerprint;
    }
    
    // ========== REGISTRATION CODE SYSTEM ==========
    
    // Registration codes collection
    const REGISTRATION_CODES = {
        // Format: 'CODE': { maxUses: number, expiryDays: number, description: string }
        'CWAC2024': { maxUses: 100, expiryDays: 30, description: 'Main registration code' },
        'FIELD2024': { maxUses: 50, expiryDays: 60, description: 'Field staff code' },
        'ADMIN2024': { maxUses: 5, expiryDays: 90, description: 'Admin override code' }
    };
    
    // Check if device is registered
    async function isDeviceRegistered(fingerprint) {
        try {
            const deviceDoc = await db.collection('RegisteredDevices').doc(fingerprint).get();
            return deviceDoc.exists;
        } catch (e) {
            console.error('Error checking device registration:', e);
            // Fallback to local storage if offline
            const localDevices = JSON.parse(localStorage.getItem('registered_devices') || '[]');
            return localDevices.includes(fingerprint);
        }
    }
    
    // Validate registration code
    async function validateRegistrationCode(code, fingerprint) {
        const normalizedCode = code.trim().toUpperCase();
        
        // Check if code exists
        if (!REGISTRATION_CODES[normalizedCode]) {
            return { valid: false, message: 'Invalid registration code' };
        }
        
        const codeInfo = REGISTRATION_CODES[normalizedCode];
        
        try {
            // Check code usage in Firebase
            const codeDoc = await db.collection('RegistrationCodes').doc(normalizedCode).get();
            
            if (codeDoc.exists) {
                const data = codeDoc.data();
                
                // Check expiry
                const createdAt = data.createdAt.toDate();
                const expiryDate = new Date(createdAt);
                expiryDate.setDate(expiryDate.getDate() + codeInfo.expiryDays);
                
                if (new Date() > expiryDate) {
                    return { valid: false, message: 'Registration code has expired' };
                }
                
                // Check max uses
                if (data.usedCount >= codeInfo.maxUses) {
                    return { valid: false, message: 'Registration code has reached maximum uses' };
                }
                
                // Check if this device already used this code
                if (data.usedBy && data.usedBy.includes(fingerprint)) {
                    return { valid: true, message: 'Device already registered with this code' };
                }
                
                return { valid: true, codeInfo, existingData: data };
            } else {
                // First time this code is being used
                return { valid: true, codeInfo, existingData: null };
            }
        } catch (e) {
            console.error('Error validating code:', e);
            // If offline, allow using code (will validate when online)
            return { valid: true, codeInfo, offline: true };
        }
    }
    
    // Register device with code
    async function registerDevice(code, fingerprint) {
        const validation = await validateRegistrationCode(code, fingerprint);
        
        if (!validation.valid) {
            return { success: false, message: validation.message };
        }
        
        try {
            const normalizedCode = code.trim().toUpperCase();
            const codeInfo = validation.codeInfo;
            
            // Get device info
            const deviceInfo = {
                fingerprint: fingerprint,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                screenSize: `${screen.width}x${screen.height}`,
                firstSeen: localStorage.getItem('device_first_seen') || new Date().toISOString(),
                registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
                registrationCode: normalizedCode
            };
            
            // Start a batch write
            const batch = db.batch();
            
            // Update or create registration code document
            const codeRef = db.collection('RegistrationCodes').doc(normalizedCode);
            
            if (validation.existingData) {
                batch.update(codeRef, {
                    usedCount: firebase.firestore.FieldValue.increment(1),
                    usedBy: firebase.firestore.FieldValue.arrayUnion(fingerprint),
                    lastUsed: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                batch.set(codeRef, {
                    code: normalizedCode,
                    maxUses: codeInfo.maxUses,
                    expiryDays: codeInfo.expiryDays,
                    description: codeInfo.description,
                    usedCount: 1,
                    usedBy: [fingerprint],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUsed: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // Register the device
            const deviceRef = db.collection('RegisteredDevices').doc(fingerprint);
            batch.set(deviceRef, deviceInfo);
            
            // Add to registration history
            const historyRef = db.collection('RegistrationHistory').doc();
            batch.set(historyRef, {
                fingerprint: fingerprint,
                code: normalizedCode,
                registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
                deviceInfo: deviceInfo
            });
            
            await batch.commit();
            
            // Store in local storage
            localStorage.setItem('device_registered', 'true');
            localStorage.setItem('device_registration_code', normalizedCode);
            localStorage.setItem('device_registration_date', new Date().toISOString());
            
            // Add to local registered devices list
            const localDevices = JSON.parse(localStorage.getItem('registered_devices') || '[]');
            if (!localDevices.includes(fingerprint)) {
                localDevices.push(fingerprint);
                localStorage.setItem('registered_devices', JSON.stringify(localDevices));
            }
            
            return { 
                success: true, 
                message: 'Device registered successfully',
                code: normalizedCode
            };
            
        } catch (e) {
            console.error('Error registering device:', e);
            
            // If offline, store registration locally
            if (!navigator.onLine) {
                localStorage.setItem('device_registered', 'true');
                localStorage.setItem('device_registration_code', code);
                localStorage.setItem('device_registration_date', new Date().toISOString());
                localStorage.setItem('pending_registration', 'true');
                
                return { 
                    success: true, 
                    message: 'Device registered offline - will sync when online',
                    offline: true
                };
            }
            
            return { success: false, message: 'Error registering device: ' + e.message };
        }
    }
    
    // Check and sync pending registrations
    async function syncPendingRegistrations() {
        const pending = localStorage.getItem('pending_registration');
        if (pending === 'true' && navigator.onLine) {
            const fingerprint = localStorage.getItem('device_fingerprint');
            const code = localStorage.getItem('device_registration_code');
            
            if (fingerprint && code) {
                const result = await registerDevice(code, fingerprint);
                if (result.success) {
                    localStorage.removeItem('pending_registration');
                    console.log('Pending registration synced successfully');
                }
            }
        }
    }
    
    // ========== REGISTRATION UI ==========
    
    // Create registration overlay
    function createRegistrationOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'registrationOverlay';
        overlay.className = 'registration-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'registration-modal';
        
        modal.innerHTML = `
            <div class="registration-header">
                <span class="registration-icon">🔐</span>
                <h1>Device Registration Required</h1>
                <p>This device needs to be registered before accessing the CWAC Manager. Please enter a valid registration code provided by your administrator.</p>
            </div>
            
            <div class="registration-body">
                <input type="text" 
                       id="registrationCode" 
                       class="registration-input" 
                       placeholder="Enter registration code"
                       autocomplete="off"
                       autofocus>
                
                <div id="registrationMessage" class="registration-message"></div>
                
                <button id="registerBtn" class="registration-btn">
                    Register Device
                </button>
            </div>
            
            <div class="registration-footer">
                <p>⚠️ Each code can only be used on a limited number of devices.</p>
                <p>Contact your administrator if you need a registration code.</p>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Add event listeners
        const input = document.getElementById('registrationCode');
        const registerBtn = document.getElementById('registerBtn');
        const messageDiv = document.getElementById('registrationMessage');
        
        input.focus();
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                registerBtn.click();
            }
        });
        
        registerBtn.addEventListener('click', async () => {
            const code = input.value.trim();
            if (!code) {
                showRegistrationMessage(messageDiv, 'Please enter a registration code', 'error');
                return;
            }
            
            registerBtn.disabled = true;
            registerBtn.classList.add('loading');
            registerBtn.textContent = 'Registering...';
            
            const fingerprint = await generateDeviceFingerprint();
            const result = await registerDevice(code, fingerprint);
            
            if (result.success) {
                showRegistrationMessage(messageDiv, result.message, 'success');
                setTimeout(() => {
                    overlay.classList.add('fade-out');
                    setTimeout(() => {
                        overlay.remove();
                        checkDeviceRegistration();
                    }, 300);
                }, 1500);
            } else {
                showRegistrationMessage(messageDiv, result.message, 'error');
                registerBtn.disabled = false;
                registerBtn.classList.remove('loading');
                registerBtn.textContent = 'Register Device';
                input.focus();
            }
        });
    }
    
    function showRegistrationMessage(element, message, type) {
        element.innerHTML = `<div class="registration-alert registration-alert-${type}">${type === 'success' ? '✅' : '❌'} ${message}</div>`;
    }
    
    // ========== DEVICE REGISTRATION CHECK ==========
    
    // Main registration check
    async function checkDeviceRegistration() {
        // Check if already registered in this session
        if (sessionStorage.getItem('device_verified') === 'true') {
            return true;
        }
        
        const fingerprint = await generateDeviceFingerprint();
        
        // Check local storage first
        const locallyRegistered = localStorage.getItem('device_registered') === 'true';
        
        if (locallyRegistered) {
            // Verify with cloud if online
            if (navigator.onLine) {
                const registered = await isDeviceRegistered(fingerprint);
                if (registered) {
                    sessionStorage.setItem('device_verified', 'true');
                    await syncPendingRegistrations();
                    return true;
                } else {
                    // Clear invalid local registration
                    localStorage.removeItem('device_registered');
                    localStorage.removeItem('device_registration_code');
                    localStorage.removeItem('device_registration_date');
                }
            } else {
                // Offline but locally registered - allow access
                sessionStorage.setItem('device_verified', 'true');
                return true;
            }
        }
        
        // Check if we're in admin bypass mode (for initial setup)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('bypass') === 'admin123') {
            sessionStorage.setItem('device_verified', 'true');
            localStorage.setItem('device_registered', 'true');
            localStorage.setItem('device_registration_code', 'ADMIN_BYPASS');
            showToast('Admin bypass mode activated', 'warning');
            return true;
        }
        
        // Check if this is first visit and we have a default code in URL
        const codeParam = urlParams.get('code');
        if (codeParam && REGISTRATION_CODES[codeParam.toUpperCase()]) {
            const result = await registerDevice(codeParam, fingerprint);
            if (result.success) {
                sessionStorage.setItem('device_verified', 'true');
                showToast('Device auto-registered successfully', 'success');
                return true;
            }
        }
        
        // Not registered - show registration overlay
        createRegistrationOverlay();
        return false;
    }
    
    // ========== ENHANCED ADMIN REGISTRATION MANAGEMENT ==========
    
    // Show registration management dashboard
    window.showRegistrationDashboard = async function() {
        if (userRole !== 'admin') {
            showToast('Only administrators can manage registrations', 'error');
            return;
        }
        
        try {
            showToast('Loading registration data...', 'info');
            
            // Fetch all data
            const [devicesSnapshot, codesSnapshot, historySnapshot] = await Promise.all([
                db.collection('RegisteredDevices').get(),
                db.collection('RegistrationCodes').get(),
                db.collection('RegistrationHistory').orderBy('registeredAt', 'desc').limit(100).get()
            ]);
            
            const devices = [];
            devicesSnapshot.forEach(doc => {
                devices.push({ id: doc.id, ...doc.data() });
            });
            
            const codes = [];
            codesSnapshot.forEach(doc => {
                codes.push({ id: doc.id, ...doc.data() });
            });
            
            const history = [];
            historySnapshot.forEach(doc => {
                history.push({ id: doc.id, ...doc.data() });
            });
            
            // Create dashboard modal
            createRegistrationDashboard(devices, codes, history);
            
        } catch (e) {
            console.error('Error loading registration data:', e);
            showToast('Error loading registration data: ' + e.message, 'error');
        }
    };
    
    // Create the dashboard UI
    function createRegistrationDashboard(devices, codes, history) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.admin-registration-modal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.className = 'admin-registration-modal';
        
        modal.innerHTML = `
            <div class="admin-registration-header">
                <h2>🔐 Registration Management Dashboard</h2>
                <button class="close-btn" onclick="this.closest('.admin-registration-modal').remove()">✕</button>
            </div>
            
            <div class="dashboard-stats">
                <div class="stat-card">
                    <span class="stat-value">${devices.length}</span>
                    <span class="stat-label">Registered Devices</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${codes.length}</span>
                    <span class="stat-label">Active Codes</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${codes.reduce((sum, c) => sum + (c.usedCount || 0), 0)}</span>
                    <span class="stat-label">Total Registrations</span>
                </div>
            </div>
            
            <div class="admin-registration-tabs">
                <button class="tab-btn active" data-tab="codes">📋 Manage Codes</button>
                <button class="tab-btn" data-tab="devices">📱 Devices (${devices.length})</button>
                <button class="tab-btn" data-tab="history">📊 Registration History</button>
                <button class="tab-btn" data-tab="generate">✨ Generate New Code</button>
            </div>
            
            <div class="admin-registration-content">
                <!-- Codes Tab -->
                <div class="tab-pane active" id="codes-tab">
                    <div class="table-header">
                        <h3>Registration Codes</h3>
                        <button class="refresh-btn" onclick="showRegistrationDashboard()">🔄 Refresh</button>
                    </div>
                    <table class="registration-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Description</th>
                                <th>Usage</th>
                                <th>Expiry</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${codes.length ? codes.map(c => {
                                const createdAt = c.createdAt ? c.createdAt.toDate() : new Date();
                                const expiryDate = new Date(createdAt);
                                expiryDate.setDate(expiryDate.getDate() + (c.expiryDays || 30));
                                const now = new Date();
                                const isExpired = now > expiryDate;
                                const isFull = c.usedCount >= c.maxUses;
                                const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                                
                                let statusClass = 'active';
                                let statusText = '✅ Active';
                                if (isExpired) {
                                    statusClass = 'expired';
                                    statusText = '❌ Expired';
                                } else if (isFull) {
                                    statusClass = 'full';
                                    statusText = '⚠️ Full';
                                }
                                
                                return `
                                    <tr class="${statusClass}">
                                        <td><strong>${c.code || c.id}</strong></td>
                                        <td>${c.description || 'No description'}</td>
                                        <td>${c.usedCount || 0}/${c.maxUses}</td>
                                        <td>${expiryDate.toLocaleDateString()} (${daysLeft > 0 ? daysLeft + ' days' : 'Expired'})</td>
                                        <td>${statusText}</td>
                                        <td>
                                            <button class="action-btn copy-btn" onclick="copyToClipboard('${c.code || c.id}')" title="Copy code">📋</button>
                                            <button class="action-btn delete-btn" onclick="deleteRegistrationCode('${c.code || c.id}')" title="Delete code">🗑️</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('') : `
                                <tr>
                                    <td colspan="6" style="text-align: center; padding: 30px;">
                                        No registration codes found. Generate one in the "Generate New Code" tab.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
                
                <!-- Devices Tab -->
                <div class="tab-pane" id="devices-tab">
                    <table class="registration-table">
                        <thead>
                            <tr>
                                <th>Device Fingerprint</th>
                                <th>Code Used</th>
                                <th>Platform</th>
                                <th>Registered</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${devices.length ? devices.map(d => `
                                <tr>
                                    <td><small>${d.fingerprint ? d.fingerprint.substring(0, 20) + '...' : 'Unknown'}</small></td>
                                    <td>${d.registrationCode || 'N/A'}</td>
                                    <td>${d.platform || 'Unknown'}</td>
                                    <td>${d.registeredAt ? new Date(d.registeredAt.toDate()).toLocaleString() : 'Unknown'}</td>
                                    <td>
                                        <button class="action-btn delete-btn" onclick="revokeDeviceAccess('${d.fingerprint}')" title="Revoke access">🚫</button>
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="5" style="text-align: center; padding: 30px;">
                                        No devices registered yet.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
                
                <!-- History Tab -->
                <div class="tab-pane" id="history-tab">
                    <table class="registration-table">
                        <thead>
                            <tr>
                                <th>Date/Time</th>
                                <th>Code Used</th>
                                <th>Device</th>
                                <th>Platform</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${history.length ? history.map(h => `
                                <tr>
                                    <td>${h.registeredAt ? new Date(h.registeredAt.toDate()).toLocaleString() : 'Unknown'}</td>
                                    <td>${h.code || 'N/A'}</td>
                                    <td><small>${h.fingerprint ? h.fingerprint.substring(0, 20) + '...' : 'Unknown'}</small></td>
                                    <td>${h.deviceInfo?.platform || 'Unknown'}</td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="4" style="text-align: center; padding: 30px;">
                                        No registration history yet.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
                
                <!-- Generate Code Tab -->
                <div class="tab-pane" id="generate-tab">
                    <div class="generate-code-form">
                        <h3>Generate New Registration Code</h3>
                        
                        <div class="form-group">
                            <label>Code (optional):</label>
                            <input type="text" id="newCode" placeholder="Leave blank for auto-generated" class="form-input">
                            <small>If blank, will generate a random code like: CWAC-XXXX-XXXX</small>
                        </div>
                        
                        <div class="form-group">
                            <label>Description:</label>
                            <input type="text" id="codeDescription" placeholder="e.g., Field staff 2024" class="form-input" value="Field staff registration">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Max Uses:</label>
                                <input type="number" id="maxUses" value="50" min="1" max="1000" class="form-input">
                            </div>
                            
                            <div class="form-group">
                                <label>Expiry (days):</label>
                                <input type="number" id="expiryDays" value="30" min="1" max="365" class="form-input">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Code Type:</label>
                            <select id="codeType" class="form-input">
                                <option value="standard">Standard Access (Viewer)</option>
                                <option value="editor">Editor Access (Can edit phones)</option>
                                <option value="admin">Admin Access (Full access)</option>
                            </select>
                        </div>
                        
                        <div class="generated-code-preview" id="codePreview" style="display: none;">
                            <strong>Generated Code:</strong>
                            <code id="previewCode"></code>
                            <button class="copy-btn-small" onclick="copyGeneratedCode()">Copy</button>
                        </div>
                        
                        <div class="form-actions">
                            <button class="generate-btn" onclick="generateNewCode()">
                                ✨ Generate Code
                            </button>
                            <button class="generate-btn secondary" onclick="generateMultipleCodes()">
                                📦 Generate Multiple (5)
                            </button>
                        </div>
                        
                        <div id="generationResult" class="generation-result"></div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add tab switching
        modal.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                modal.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                
                btn.classList.add('active');
                modal.querySelector(`#${btn.dataset.tab}-tab`).classList.add('active');
            });
        });
    }
    
    // Generate a single new code
    window.generateNewCode = async function() {
        const codeInput = document.getElementById('newCode');
        const description = document.getElementById('codeDescription').value || 'Registration code';
        const maxUses = parseInt(document.getElementById('maxUses').value) || 50;
        const expiryDays = parseInt(document.getElementById('expiryDays').value) || 30;
        const codeType = document.getElementById('codeType').value;
        
        // Generate code if blank
        let code = codeInput.value.trim().toUpperCase();
        if (!code) {
            const prefix = codeType === 'admin' ? 'ADMIN' : (codeType === 'editor' ? 'EDIT' : 'CWAC');
            const random = Math.random().toString(36).substring(2, 8).toUpperCase();
            code = `${prefix}-${random}`;
        }
        
        try {
            // Check if code already exists
            const existingCode = await db.collection('RegistrationCodes').doc(code).get();
            if (existingCode.exists) {
                showToast('Code already exists! Please use a different code.', 'error');
                return;
            }
            
            // Create the code
            await db.collection('RegistrationCodes').doc(code).set({
                code: code,
                description: description,
                maxUses: maxUses,
                expiryDays: expiryDays,
                codeType: codeType,
                usedCount: 0,
                usedBy: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: userRole
            });
            
            // Show preview
            const preview = document.getElementById('codePreview');
            const previewCode = document.getElementById('previewCode');
            previewCode.textContent = code;
            preview.style.display = 'flex';
            
            document.getElementById('generationResult').innerHTML = `
                <div class="success-message">
                    ✅ Code generated successfully!
                    <button onclick="copyToClipboard('${code}')">Copy Code</button>
                </div>
            `;
            
            // Clear input
            document.getElementById('newCode').value = '';
            
            showToast(`Code ${code} generated successfully!`, 'success');
            
        } catch (e) {
            console.error('Error generating code:', e);
            showToast('Error generating code: ' + e.message, 'error');
        }
    };
    
    // Generate multiple codes at once - FIXED VERSION
window.generateMultipleCodes = async function() {
    const count = 5;
    const description = document.getElementById('codeDescription').value || 'Bulk registration';
    const maxUses = parseInt(document.getElementById('maxUses').value) || 50;
    const expiryDays = parseInt(document.getElementById('expiryDays').value) || 30;
    const codeType = document.getElementById('codeType').value;
    
    try {
        const batch = db.batch();
        const codes = [];
        
        for (let i = 0; i < count; i++) {
            const prefix = codeType === 'admin' ? 'ADMIN' : (codeType === 'editor' ? 'EDIT' : 'CWAC');
            const random = Math.random().toString(36).substring(2, 8).toUpperCase();
            const code = `${prefix}-${random}`;
            
            const codeRef = db.collection('RegistrationCodes').doc(code);
            batch.set(codeRef, {
                code: code,
                description: `${description} #${i+1}`,
                maxUses: maxUses,
                expiryDays: expiryDays,
                codeType: codeType,
                usedCount: 0,
                usedBy: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: userRole
            });
            
            codes.push(code);
        }
        
        await batch.commit();
        
        // Show results with working download button
        const resultDiv = document.getElementById('generationResult');
        resultDiv.innerHTML = `
            <div class="success-message">
                ✅ Generated ${count} codes:
                <div style="margin-top: 10px; max-height: 200px; overflow-y: auto;">
                    ${codes.map(code => `
                        <div style="margin: 8px 0; display: flex; align-items: center; gap: 10px; padding: 5px; background: rgba(255,255,255,0.1); border-radius: 4px;">
                            <code style="flex: 1; font-family: monospace;">${code}</code>
                            <button class="copy-btn-small" onclick="copyToClipboard('${code}')">Copy</button>
                        </div>
                    `).join('')}
                </div>
                <button onclick="downloadCodesAsCSV(${JSON.stringify(codes)})" style="margin-top: 15px; padding: 8px 16px; background: var(--success-color); color: white; border: none; border-radius: 4px; cursor: pointer;">
                    📥 Download ${codes.length} Codes as CSV
                </button>
            </div>
        `;
        
        showToast(`Generated ${count} codes successfully!`, 'success');
        
    } catch (e) {
        console.error('Error generating multiple codes:', e);
        showToast('Error generating codes: ' + e.message, 'error');
    }
};
    
    // Copy generated code
    window.copyGeneratedCode = function() {
        const code = document.getElementById('previewCode').textContent;
        copyToClipboard(code);
    };
    
    // Download codes as CSV - FIXED VERSION
    window.downloadCodesAsCSV = function(codes) {
    try {
        // Ensure codes is an array
        const codesArray = Array.isArray(codes) ? codes : [];
        
        if (codesArray.length === 0) {
            showToast('No codes to download', 'warning');
            return;
        }
        
        // Create CSV content
        let csvContent = "Code,Description,Max Uses,Expiry Days,Type,Created Date\n";
        const now = new Date().toISOString().split('T')[0];
        
        codesArray.forEach(code => {
            // Escape any commas in the code
            const escapedCode = code.includes(',') ? `"${code}"` : code;
            csvContent += `${escapedCode},Bulk generated,50,30,standard,${now}\n`;
        });
        
        // Create blob and download
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); // Added BOM for Excel compatibility
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        
        link.href = url;
        link.download = `registration_codes_${now}.csv`;
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast(`Downloaded ${codesArray.length} codes`, 'success');
        
    } catch (error) {
        console.error('Error downloading CSV:', error);
        showToast('Error downloading CSV: ' + error.message, 'error');
    }
};
    
    // Delete a registration code
    window.deleteRegistrationCode = async function(code) {
        if (!confirm(`Are you sure you want to delete code "${code}"? This cannot be undone.`)) {
            return;
        }
        
        try {
            await db.collection('RegistrationCodes').doc(code).delete();
            showToast(`Code ${code} deleted`, 'success');
            showRegistrationDashboard(); // Refresh
        } catch (e) {
            console.error('Error deleting code:', e);
            showToast('Error deleting code: ' + e.message, 'error');
        }
    };
    
    // Revoke device access
    window.revokeDeviceAccess = async function(fingerprint) {
        if (!confirm('Are you sure you want to revoke access for this device? The user will need to register again.')) {
            return;
        }
        
        try {
            await db.collection('RegisteredDevices').doc(fingerprint).delete();
            showToast('Device access revoked', 'success');
            showRegistrationDashboard(); // Refresh
        } catch (e) {
            console.error('Error revoking access:', e);
            showToast('Error revoking access: ' + e.message, 'error');
        }
    };
    
    // ========== INTEGRATE WITH EXISTING USER ROLE SYSTEM ==========
    
    // Override user role check to include registration
    let userRole = 'viewer';
    
    async function initializeWithRegistration() {
        // First check device registration
        const registered = await checkDeviceRegistration();
        
        if (!registered) {
            return; // Registration overlay will handle it
        }
        
        // Proceed with normal initialization
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('role') === 'admin') {
            userRole = 'admin';
        } else {
            // Check if device has admin privileges from registration
            const fingerprint = await generateDeviceFingerprint();
            const registeredWithAdmin = localStorage.getItem('device_registration_code') === 'ADMIN2024';
            
            if (registeredWithAdmin) {
                userRole = 'admin';
            } else {
                const access = prompt('Enter access code (leave blank for viewer mode):');
                if (access === 'admin123') {
                    userRole = 'admin';
                } else {
                    userRole = 'viewer';
                    if (access !== null && access !== '') {
                        showToast('Invalid code. Continuing in viewer mode.', 'warning');
                    }
                }
            }
        }
        
        console.log(`User role: ${userRole}`);
        
        // Role indicator
        const roleIndicator = document.createElement('div');
        roleIndicator.id = 'roleIndicator';
        roleIndicator.className = userRole === 'admin' ? 'role-indicator admin' : 'role-indicator viewer';
        roleIndicator.textContent = userRole === 'admin' ? '👑 ADMIN MODE' : '👁️ VIEWER MODE';
        document.body.appendChild(roleIndicator);
        
        // Continue with normal initialization
        completeInitialization();
    }
    
    // Complete the rest of the initialization
    function completeInitialization() {
        // Set up online/offline sync for registrations
        window.addEventListener('online', () => {
            syncPendingRegistrations();
        });
        
        // Apply role-based UI
        applyRoleBasedUI();
        
        // Add admin registration button if admin
        addAdminRegistrationButton();
        
        // Continue with existing initialization
        DebugPanel.init();
        addCreditLine();
        addSyncButton();
        initializeData();
        
        console.log('App initialization complete with Registration System');
    }
    
    // Add admin button to view registrations
    function addAdminRegistrationButton() {
        if (userRole !== 'admin') return;
        
        const btn = document.createElement('button');
        btn.innerHTML = '🔐 Manage Registrations';
        btn.className = 'admin-registration-btn';
        btn.onclick = showRegistrationDashboard;
        document.body.appendChild(btn);
    }
    
    // ========== MODIFY EXISTING FUNCTIONS TO INCLUDE REGISTRATION ==========
    
    // Store original functions
    const originalSaveDataToCloud = window.saveDataToCloud;
    const originalLoadDataFromCloud = window.loadDataFromCloud;
    
    // Override save function
    window.saveDataToCloud = async function() {
        await syncPendingRegistrations();
        if (typeof originalSaveDataToCloud === 'function') {
            return originalSaveDataToCloud();
        }
    };
    
    // Override load function
    window.loadDataFromCloud = async function() {
        await syncPendingRegistrations();
        if (typeof originalLoadDataFromCloud === 'function') {
            return originalLoadDataFromCloud();
        }
    };
    
    // ========== START THE APPLICATION ==========
    
    // Override the get started button to check registration first
    const getStartedBtn = document.getElementById('getStarted');
    if (getStartedBtn) {
        const originalClick = getStartedBtn.onclick;
        getStartedBtn.onclick = async function(e) {
            e.preventDefault();
            const registered = await checkDeviceRegistration();
            if (registered) {
                const memberManagement = document.getElementById('memberManagement');
                const header = document.querySelector('header');
                if (memberManagement && header) {
                    memberManagement.style.display = 'block';
                    header.style.display = 'none';
                    console.log('Get Started clicked - showing member management');
                    
                    setTimeout(() => {
                        applyRoleBasedUI();
                        showDataStats();
                        addSearchToLists();
                        initializeData();
                    }, 100);
                }
            }
        };
    }
    
    // Start the initialization process
    initializeWithRegistration();
    
    // ========== DRAGGABLE SYNC BUTTONS FUNCTIONALITY ==========
    
    // Make sync buttons draggable on mobile
    function makeDraggable(element) {
        if (!element) return;
        
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let isDragging = false;
        
        // Set initial position if not set
        if (!element.style.top) {
            element.style.top = '20px';
            element.style.left = '20px';
        }
        
        // Mouse events for desktop
        element.addEventListener('mousedown', dragMouseDown);
        
        // Touch events for mobile
        element.addEventListener('touchstart', dragTouchStart, { passive: false });
        
        // Prevent default drag behavior on the element
        element.addEventListener('dragstart', (e) => e.preventDefault());

        function dragMouseDown(e) {
            e.preventDefault();
            isDragging = true;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            document.addEventListener('mousemove', elementDrag);
            document.addEventListener('mouseup', closeDragElement);
            
            // Change cursor while dragging
            element.style.cursor = 'grabbing';
        }

        function dragTouchStart(e) {
            e.preventDefault();
            isDragging = true;
            const touch = e.touches[0];
            pos3 = touch.clientX;
            pos4 = touch.clientY;
            
            document.addEventListener('touchmove', touchDrag, { passive: false });
            document.addEventListener('touchend', closeDragElement);
            document.addEventListener('touchcancel', closeDragElement);
        }

        function elementDrag(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            // Keep element within viewport bounds
            const newTop = element.offsetTop - pos2;
            const newLeft = element.offsetLeft - pos1;
            
            // Constrain to viewport
            const maxTop = window.innerHeight - element.offsetHeight;
            const maxLeft = window.innerWidth - element.offsetWidth;
            
            element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
            element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
        }

        function touchDrag(e) {
            if (!isDragging) return;
            e.preventDefault();
            
            const touch = e.touches[0];
            pos1 = pos3 - touch.clientX;
            pos2 = pos4 - touch.clientY;
            pos3 = touch.clientX;
            pos4 = touch.clientY;
            
            // Keep element within viewport bounds
            const newTop = element.offsetTop - pos2;
            const newLeft = element.offsetLeft - pos1;
            
            // Constrain to viewport
            const maxTop = window.innerHeight - element.offsetHeight;
            const maxLeft = window.innerWidth - element.offsetWidth;
            
            element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
            element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
        }

        function closeDragElement() {
            isDragging = false;
            element.style.cursor = 'grab';
            
            document.removeEventListener('mousemove', elementDrag);
            document.removeEventListener('mouseup', closeDragElement);
            document.removeEventListener('touchmove', touchDrag);
            document.removeEventListener('touchend', closeDragElement);
            document.removeEventListener('touchcancel', closeDragElement);
            
            // Save position to localStorage
            const pos = {
                top: element.style.top,
                left: element.style.left
            };
            localStorage.setItem('syncButtonsPos', JSON.stringify(pos));
        }
    }

    // Function to initialize draggable sync buttons
    function initDraggableSyncButtons() {
        const syncDiv = document.getElementById('syncDiv');
        
        if (syncDiv) {
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    syncDiv.style.position = 'fixed';
                    syncDiv.style.cursor = 'grab';
                    syncDiv.style.touchAction = 'none';
                    syncDiv.style.userSelect = 'none';
                    syncDiv.style.webkitUserSelect = 'none';
                    syncDiv.style.webkitTouchCallout = 'none';
                    
                    const savedPos = localStorage.getItem('syncButtonsPos');
                    if (savedPos) {
                        try {
                            const pos = JSON.parse(savedPos);
                            syncDiv.style.top = pos.top;
                            syncDiv.style.left = pos.left;
                        } catch (e) {
                            console.log('Error restoring position:', e);
                        }
                    }
                    
                    makeDraggable(syncDiv);
                    
                    syncDiv.title = 'Drag to move';
                    syncDiv.setAttribute('aria-label', 'Draggable sync buttons');
                    
                    if (!syncDiv.querySelector('.grab-handle')) {
                        const handle = document.createElement('span');
                        handle.className = 'grab-handle';
                        handle.innerHTML = '⋮⋮';
                        handle.style.cssText = `
                            color: rgba(255,255,255,0.6);
                            font-size: 18px;
                            margin-right: 8px;
                            letter-spacing: 2px;
                            font-weight: bold;
                            display: inline-block;
                        `;
                        syncDiv.insertBefore(handle, syncDiv.firstChild);
                    }
                }, 500);
            }
        } else {
            setTimeout(initDraggableSyncButtons, 1000);
        }
    }

    window.addEventListener('resize', function() {
        const syncDiv = document.getElementById('syncDiv');
        
        if (syncDiv) {
            if (window.innerWidth <= 768) {
                if (!syncDiv.draggableEnabled) {
                    syncDiv.style.cursor = 'grab';
                    syncDiv.style.touchAction = 'none';
                    makeDraggable(syncDiv);
                    syncDiv.draggableEnabled = true;
                    
                    if (!syncDiv.querySelector('.grab-handle')) {
                        const handle = document.createElement('span');
                        handle.className = 'grab-handle';
                        handle.innerHTML = '⋮⋮';
                        handle.style.cssText = `
                            color: rgba(255,255,255,0.6);
                            font-size: 18px;
                            margin-right: 8px;
                            letter-spacing: 2px;
                            font-weight: bold;
                            display: inline-block;
                        `;
                        syncDiv.insertBefore(handle, syncDiv.firstChild);
                    }
                }
            } else {
                syncDiv.style.cursor = 'default';
                syncDiv.style.touchAction = 'auto';
                syncDiv.draggableEnabled = false;
                
                const handle = syncDiv.querySelector('.grab-handle');
                if (handle) {
                    handle.remove();
                }
            }
        }
    });

    window.resetSyncButtonsPosition = function() {
        const syncDiv = document.getElementById('syncDiv');
        if (syncDiv) {
            syncDiv.style.top = '20px';
            syncDiv.style.left = '20px';
            localStorage.removeItem('syncButtonsPos');
            showToast('Sync buttons position reset', 'info');
        }
    };
    
    // ========== CLOUD SYNC FUNCTIONS ==========
    
    async function saveDataToCloud() {
        try {
            showToast('Syncing data to cloud...', 'info');
            
            const batch = db.batch();
            
            Object.keys(paidData).forEach(area => {
                paidData[area].forEach((member, index) => {
                    const memberId = member.id || `${area}_${index}_${Date.now()}`;
                    const memberRef = db.collection('PaidMembers').doc(memberId);
                    batch.set(memberRef, {
                        name: member.name,
                        id: member.id,
                        callNumber: member.callNumber,
                        cwacArea: area,
                        status: 'PAID',
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedBy: userRole,
                        index: index
                    }, { merge: true });
                });
            });
            
            Object.keys(unpaidData).forEach(area => {
                unpaidData[area].forEach((member, index) => {
                    const memberId = member.id || `${area}_${index}_${Date.now()}`;
                    const memberRef = db.collection('UnpaidMembers').doc(memberId);
                    batch.set(memberRef, {
                        name: member.name,
                        id: member.id,
                        callNumber: member.callNumber,
                        cwacArea: area,
                        status: 'UNPAID',
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedBy: userRole,
                        index: index,
                        needsReview: true
                    }, { merge: true });
                });
            });
            
            Object.keys(statusData).forEach(area => {
                statusData[area].forEach((member, index) => {
                    const memberId = member.id || `${area}_${index}_${Date.now()}`;
                    const statusRef = db.collection('Status').doc(memberId);
                    batch.set(statusRef, {
                        name: member.name,
                        id: member.id,
                        callNumber: member.callNumber,
                        cwacArea: area,
                        status: member.status || 'ALIVE',
                        lastChecked: firebase.firestore.FieldValue.serverTimestamp(),
                        checkedBy: userRole
                    }, { merge: true });
                });
            });
            
            await batch.commit();
            
            console.log('Data synced to cloud');
            showToast('Data synced successfully!', 'success');
            
            saveDataToLocal();
            
        } catch (e) {
            console.error('Cloud sync error:', e);
            showToast('Sync failed - check internet', 'error');
            
            saveDataToLocal();
        }
    }
    
    async function loadDataFromCloud() {
        try {
            showToast('Loading data from cloud...', 'info');
            
            paidData = {};
            unpaidData = {};
            statusData = {};
            
            const paidSnapshot = await db.collection('PaidMembers').get();
            paidSnapshot.forEach(doc => {
                const member = doc.data();
                const area = member.cwacArea;
                if (!paidData[area]) paidData[area] = [];
                paidData[area].push({
                    name: member.name,
                    id: member.id,
                    callNumber: member.callNumber
                });
            });
            
            const unpaidSnapshot = await db.collection('UnpaidMembers').get();
            unpaidSnapshot.forEach(doc => {
                const member = doc.data();
                const area = member.cwacArea;
                if (!unpaidData[area]) unpaidData[area] = [];
                unpaidData[area].push({
                    name: member.name,
                    id: member.id,
                    callNumber: member.callNumber
                });
            });
            
            const statusSnapshot = await db.collection('Status').get();
            statusSnapshot.forEach(doc => {
                const member = doc.data();
                const area = member.cwacArea;
                if (!statusData[area]) statusData[area] = [];
                statusData[area].push({
                    name: member.name,
                    id: member.id,
                    callNumber: member.callNumber,
                    status: member.status
                });
            });
            
            Object.keys(paidData).forEach(area => {
                paidData[area].sort((a, b) => a.name.localeCompare(b.name));
            });
            Object.keys(unpaidData).forEach(area => {
                unpaidData[area].sort((a, b) => a.name.localeCompare(b.name));
            });
            Object.keys(statusData).forEach(area => {
                statusData[area].sort((a, b) => a.name.localeCompare(b.name));
            });
            
            console.log('Data loaded from cloud');
            showToast('Data loaded successfully!', 'success');
            
            populateCwacLists();
            showDataStats();
            
            saveDataToLocal();
            
            return true;
            
        } catch (e) {
            console.error('Cloud load error:', e);
            showToast('Failed to load from cloud', 'error');
            return false;
        }
    }
    
    async function savePhoneNumberEdit(area, memberIndex, oldNumber, newNumber, memberName, memberId) {
        try {
            const editRef = db.collection('EditCallNumber').doc();
            
            await editRef.set({
                idOriginal: memberId || `unknown_${Date.now()}`,
                memberName: memberName,
                cwacArea: area,
                oldCallNumber: oldNumber,
                newCallNumber: newNumber,
                editedBy: userRole,
                editedAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending_review',
                syncedFrom: 'offline'
            });
            
            console.log('Phone number edit saved to cloud');
            
            if (unpaidData[area] && unpaidData[area][memberIndex]) {
                const member = unpaidData[area][memberIndex];
                const memberRef = db.collection('UnpaidMembers').doc(member.id || memberId);
                await memberRef.update({
                    callNumber: newNumber,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: userRole,
                    editHistory: firebase.firestore.FieldValue.arrayUnion({
                        oldNumber: oldNumber,
                        newNumber: newNumber,
                        timestamp: new Date().toISOString(),
                        editedBy: userRole
                    })
                });
            }
            
            return true;
            
        } catch (e) {
            console.error('Error saving phone edit:', e);
            return false;
        }
    }
    
    async function saveStatusUpdate(area, memberIndex, newStatus, memberName, memberId) {
        try {
            const member = statusData[area][memberIndex];
            const statusRef = db.collection('Status').doc(member.id || memberId);
            
            await statusRef.set({
                name: memberName,
                id: member.id,
                callNumber: member.callNumber,
                cwacArea: area,
                status: newStatus,
                lastChecked: firebase.firestore.FieldValue.serverTimestamp(),
                checkedBy: userRole,
                statusHistory: firebase.firestore.FieldValue.arrayUnion({
                    oldStatus: member.status,
                    newStatus: newStatus,
                    timestamp: new Date().toISOString(),
                    changedBy: userRole
                })
            }, { merge: true });
            
            console.log('Status update saved to cloud');
            return true;
            
        } catch (e) {
            console.error('Error saving status update:', e);
            return false;
        }
    }

    async function deleteAllFirebaseData() {
        if (!confirm('⚠️ This will permanently delete ALL data from Firebase! Continue?')) {
            return;
        }
        
        showToast('Deleting all data...', 'warning');
        
        try {
            const collections = ['PaidMembers', 'UnpaidMembers', 'Status', 'EditCallNumber', 'RegisteredDevices', 'RegistrationCodes', 'RegistrationHistory'];
            
            for (const collectionName of collections) {
                const snapshot = await db.collection(collectionName).get();
                const batch = db.batch();
                
                snapshot.docs.forEach((doc) => {
                    batch.delete(doc.ref);
                });
                
                await batch.commit();
                console.log(`Deleted ${collectionName}`);
            }
            
            paidData = {};
            unpaidData = {};
            statusData = {};
            localStorage.clear();
            
            showToast('All Firebase data deleted!', 'success');
            
            setTimeout(() => location.reload(), 1500);
            
        } catch (error) {
            console.error('Delete error:', error);
            showToast('Error deleting data: ' + error.message, 'error');
        }
    }

    function saveDataToLocal() {
        try {
            localStorage.setItem('cwac_paidData', JSON.stringify(paidData));
            localStorage.setItem('cwac_unpaidData', JSON.stringify(unpaidData));
            localStorage.setItem('cwac_statusData', JSON.stringify(statusData));
            localStorage.setItem('cwac_lastSync', new Date().toISOString());
            console.log('Data saved to local storage');
        } catch (e) {
            console.log('Could not save to local storage', e);
        }
    }
    
    function loadDataFromLocal() {
        try {
            const savedPaid = localStorage.getItem('cwac_paidData');
            const savedUnpaid = localStorage.getItem('cwac_unpaidData');
            const savedStatus = localStorage.getItem('cwac_statusData');
            
            if (savedPaid) paidData = JSON.parse(savedPaid);
            if (savedUnpaid) unpaidData = JSON.parse(savedUnpaid);
            if (savedStatus) statusData = JSON.parse(savedStatus);
            
            console.log('Data loaded from local storage');
            return true;
        } catch (e) {
            console.log('Could not load from local storage', e);
            return false;
        }
    }
    
    function addSyncButton() {
        const syncDiv = document.createElement('div');
        syncDiv.id = 'syncDiv';
        syncDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 10001;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(10px);
            border-radius: 50px;
            padding: 8px 16px;
            box-shadow: 0 4px 25px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.15);
            align-items: center;
        `;
        
        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = '☁️ Save to Cloud';
        saveBtn.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 30px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
            transition: all 0.3s ease;
            border: none;
            white-space: nowrap;
        `;
        saveBtn.onclick = saveDataToCloud;
        
        const loadBtn = document.createElement('button');
        loadBtn.innerHTML = '☁️ Load from Cloud';
        loadBtn.style.cssText = `
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 30px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 10px rgba(76, 175, 80, 0.3);
            transition: all 0.3s ease;
            border: none;
            white-space: nowrap;
        `;
        loadBtn.onclick = loadDataFromCloud;
        
        const statusSpan = document.createElement('span');
        statusSpan.id = 'syncStatus';
        statusSpan.style.cssText = `
            background: rgba(255,255,255,0.15);
            color: white;
            padding: 8px 16px;
            border-radius: 30px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
            border: 1px solid rgba(255,255,255,0.2);
            white-space: nowrap;
        `;
        statusSpan.innerHTML = navigator.onLine ? '🟢 Online' : '🔴 Offline';
        
        syncDiv.appendChild(saveBtn);
        syncDiv.appendChild(loadBtn);
        syncDiv.appendChild(statusSpan);
        document.body.appendChild(syncDiv);
        
        initDraggableSyncButtons();
        
        window.addEventListener('online', () => {
            const statusEl = document.getElementById('syncStatus');
            if (statusEl) statusEl.innerHTML = '🟢 Online';
            showToast('Back online - data will sync', 'success');
        });
        
        window.addEventListener('offline', () => {
            const statusEl = document.getElementById('syncStatus');
            if (statusEl) statusEl.innerHTML = '🔴 Offline';
            showToast('You are offline - changes saved locally', 'warning');
        });
    }
    
    function autoSync() {
        if (navigator.onLine) {
            saveDataToCloud();
        } else {
            saveDataToLocal();
            showToast('Offline - saved locally', 'warning');
        }
    }
    
    // ========== PERFORMANCE OPTIMIZATIONS ==========
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    class VirtualScroller {
        constructor(container, items, renderItem, itemHeight = 70) {
            this.container = container;
            this.items = items;
            this.renderItem = renderItem;
            this.itemHeight = itemHeight;
            this.visibleItems = Math.ceil(container.clientHeight / itemHeight) + 2;
            this.scrollTop = 0;
            this.startIndex = 0;
            
            container.style.overflowY = 'auto';
            container.style.position = 'relative';
            container.classList.add('virtual-scroll-container');
            
            this.content = document.createElement('div');
            this.content.style.position = 'relative';
            this.content.style.height = `${items.length * itemHeight}px`;
            container.appendChild(this.content);
            
            this.container.addEventListener('scroll', () => this.onScroll());
            this.render();
        }
        
        onScroll() {
            this.scrollTop = this.container.scrollTop;
            this.render();
        }
        
        render() {
            this.startIndex = Math.floor(this.scrollTop / this.itemHeight);
            const endIndex = Math.min(this.startIndex + this.visibleItems, this.items.length);
            
            this.content.innerHTML = '';
            
            for (let i = this.startIndex; i < endIndex; i++) {
                const item = this.renderItem(this.items[i], i);
                item.style.position = 'absolute';
                item.style.top = `${i * this.itemHeight}px`;
                item.style.width = '100%';
                item.style.padding = '0 5px';
                this.content.appendChild(item);
            }
        }
        
        updateItems(newItems) {
            this.items = newItems;
            this.content.style.height = `${newItems.length * this.itemHeight}px`;
            this.render();
        }
    }
    
    async function readLargeCSV(file, chunkSize = 1024 * 1024) {
        return new Promise((resolve, reject) => {
            let offset = 0;
            let partialLine = '';
            const results = [];
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const chunk = e.target.result;
                const lines = (partialLine + chunk).split('\n');
                partialLine = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim()) {
                        results.push(line);
                    }
                }
                
                offset += chunkSize;
                
                if (offset < file.size) {
                    readNextChunk();
                } else {
                    if (partialLine.trim()) {
                        results.push(partialLine);
                    }
                    resolve(results);
                }
            };
            
            reader.onerror = reject;
            
            const readNextChunk = () => {
                const blob = file.slice(offset, offset + chunkSize);
                reader.readAsText(blob);
            };
            
            readNextChunk();
        });
    }
    
    // ========== UI HELPER FUNCTIONS ==========
    
    function showLoading(elementId, message = 'Loading...') {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerHTML = `
                <div style="text-align: center; padding: 30px;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 15px; color: #667eea;">${message}</p>
                </div>
            `;
        }
    }
    
    function hideLoading(elementId) {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerHTML = '';
        }
    }
    
    function showToast(message, type = 'success', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    function showAlert(elementId, message, type = 'success') {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
            setTimeout(() => {
                el.innerHTML = '';
            }, 5000);
        }
    }
    
    // ========== UI CONTROL BASED ON ROLE ==========
    function applyRoleBasedUI() {
        if (userRole === 'viewer') {
            const adminSelectors = [
                '[data-tab="importExport"]',
                '#importBtn',
                '#exportPaidBtn',
                '#exportUnpaidBtn',
                '#csvFile',
                '#downloadUpdatedBtn',
                '#exportStatusBtn',
                '#importStatusBtn',
                '#statusCsvFile',
                '.import-section',
                '.export-section'
            ];
            
            adminSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.display = 'none';
                });
            });
            
            const editTab = document.querySelector('[data-tab="edit"]');
            if (editTab) {
                editTab.style.display = 'block';
            }
            
            const editSection = document.getElementById('edit');
            if (editSection && !editSection.querySelector('.viewer-notice')) {
                const notice = document.createElement('div');
                notice.className = 'alert alert-info';
                notice.style.marginBottom = '15px';
                notice.style.background = '#fff3cd';
                notice.style.color = '#856404';
                notice.innerHTML = '👁️ You can edit phone numbers below. Changes are saved to cloud.';
                editSection.insertBefore(notice, editSection.firstChild);
            }
            
            const statusSection = document.getElementById('status');
            if (statusSection && !statusSection.querySelector('.viewer-notice')) {
                const notice = document.createElement('div');
                notice.className = 'alert alert-success';
                notice.style.marginBottom = '15px';
                notice.style.background = '#d4edda';
                notice.style.color = '#155724';
                notice.innerHTML = '✅ You can update member status (Alive/Deceased) here.';
                statusSection.insertBefore(notice, statusSection.firstChild);
            }
            
            const viewOnlyTabs = ['paid', 'unpaid'];
            viewOnlyTabs.forEach(tabId => {
                const tab = document.getElementById(tabId);
                if (tab && !tab.querySelector('.viewer-notice')) {
                    const notice = document.createElement('div');
                    notice.className = 'viewer-notice';
                    notice.innerHTML = '👁️ Viewing mode - Data viewing only';
                    tab.insertBefore(notice, tab.firstChild);
                }
            });
            
        } else {
            document.querySelectorAll('[data-tab="importExport"]').forEach(el => {
                el.style.display = 'block';
            });
        }
    }
    
    // ========== KEYBOARD SHORTCUTS ==========
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'h') {
            e.preventDefault();
            goToLandingPage();
            showToast('Returned to home', 'info');
        }
        
        if (e.ctrlKey && e.key >= '1' && e.key <= '5') {
            e.preventDefault();
            const index = parseInt(e.key) - 1;
            if (tabButtons && tabButtons[index]) {
                tabButtons[index].click();
                showToast(`Switched to ${tabButtons[index].textContent} tab`, 'info');
            }
        }
    });
    
    // ========== DATA STORAGE ==========
    let paidData = {};
    let unpaidData = {};
    let statusData = {};
    let failedRecords = [];
    let virtualScrollers = {};
    
    async function initializeData() {
        const cloudLoaded = await loadDataFromCloud();
        if (!cloudLoaded) {
            const localLoaded = loadDataFromLocal();
            if (localLoaded) {
                showToast('Loaded data from local storage', 'info');
                populateCwacLists();
                showDataStats();
            }
        }
    }

    window.goToLandingPage = function() {
        const memberManagement = document.getElementById('memberManagement');
        const header = document.querySelector('header');
        if (memberManagement && header) {
            memberManagement.style.display = 'none';
            header.style.display = 'block';
            
            document.getElementById('paidMembers').innerHTML = '';
            document.getElementById('unpaidMembers').innerHTML = '';
            document.getElementById('statusMembers').innerHTML = '';
            
            showToast('Returned to home page', 'info');
        }
    };

    const tabButtons = document.querySelectorAll('.tabBtn');
    const tabContents = document.querySelectorAll('.tabContent');

    if (tabButtons.length > 0) {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.style.display = 'none');

                btn.classList.add('active');
                const tabId = btn.dataset.tab;
                const tabElement = document.getElementById(tabId);
                if (tabElement) {
                    tabElement.style.display = 'block';
                    
                    if (tabId === 'edit') {
                        loadUnpaidMembersForEditing();
                    }
                    if (tabId === 'status') {
                        loadStatusMembers();
                    }
                    if (tabId === 'paid' || tabId === 'unpaid') {
                        showDataStats();
                    }
                }
            });
        });

        if (tabButtons[0]) {
            tabButtons[0].classList.add('active');
            const firstTab = document.getElementById(tabButtons[0].dataset.tab);
            if (firstTab) {
                firstTab.style.display = 'block';
            }
        }
    }

    const callNumberInput = document.getElementById('callNumber');
    if (callNumberInput) {
        callNumberInput.addEventListener('input', function () {
            let value = callNumberInput.value;
            value = value.replace(/\D/g, '');
            if (value.length > 9) value = value.slice(0, 9);
            if (value.length > 0 && value[0] === '0') value = value.slice(1);
            callNumberInput.value = value;
        });
    }

    function addCreditLine() {
        const header = document.querySelector('header');
        if (header) {
            const creditDiv = document.createElement('div');
            creditDiv.style.cssText = `
                position: absolute;
                bottom: 20px;
                left: 0;
                right: 0;
                text-align: center;
                color: rgba(255, 255, 255, 0.8);
                font-size: 14px;
                padding: 15px;
                background: rgba(0, 0, 0, 0.2);
                backdrop-filter: blur(5px);
            `;
            creditDiv.innerHTML = 'Created with ❤️ by Tha for Chibombo';
            header.style.position = 'relative';
            header.appendChild(creditDiv);
        }
    }

    function showDataStats() {
        const stats = {
            totalPaid: Object.values(paidData).reduce((sum, arr) => sum + arr.length, 0),
            totalUnpaid: Object.values(unpaidData).reduce((sum, arr) => sum + arr.length, 0),
            totalStatus: Object.values(statusData).reduce((sum, arr) => sum + arr.length, 0),
            paidAreas: Object.keys(paidData).length,
            unpaidAreas: Object.keys(unpaidData).length,
            statusAreas: Object.keys(statusData).length
        };
        
        const statsBar = document.createElement('div');
        statsBar.className = 'stats-bar';
        
        statsBar.innerHTML = `
            <div><span style="font-size: 1.2rem;">💰</span> <strong>Paid:</strong> ${stats.totalPaid} members</div>
            <div><span style="font-size: 1.2rem;">⚠️</span> <strong>Unpaid:</strong> ${stats.totalUnpaid} members</div>
            <div><span style="font-size: 1.2rem;">📊</span> <strong>Status:</strong> ${stats.totalStatus} members</div>
            <div><span style="font-size: 1.2rem;">📍</span> <strong>Areas:</strong> ${stats.paidAreas + stats.unpaidAreas}</div>
        `;
        
        const mainContainer = document.querySelector('#memberManagement');
        const existingStats = document.querySelector('.stats-bar');
        
        if (mainContainer) {
            if (existingStats) {
                existingStats.replaceWith(statsBar);
            } else {
                mainContainer.insertBefore(statsBar, mainContainer.firstChild);
            }
        }
    }

    function addSearchToLists() {
        const lists = ['paid', 'unpaid'];
        
        lists.forEach(type => {
            const container = document.getElementById(`${type}Members`);
            if (container && !container.querySelector('.search-box')) {
                const searchDiv = document.createElement('div');
                searchDiv.className = 'search-box';
                
                searchDiv.innerHTML = `
                    <input type="text" 
                           placeholder="🔍 Search by name or ID..." 
                           id="${type}Search"
                           style="width: 100%;">
                `;
                
                if (container.firstChild) {
                    container.insertBefore(searchDiv, container.firstChild);
                } else {
                    container.appendChild(searchDiv);
                }
                
                document.getElementById(`${type}Search`).addEventListener('input', 
                    debounce((e) => filterMembers(type, e.target.value), 300)
                );
            }
        });
    }

    function filterMembers(type, searchTerm) {
        if (!searchTerm.trim()) {
            populateCwacLists();
            return;
        }
        
        const data = type === 'paid' ? paidData : unpaidData;
        const filtered = {};
        
        Object.keys(data).forEach(area => {
            const matched = data[area].filter(member => 
                member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                member.id.toLowerCase().includes(searchTerm.toLowerCase())
            );
            if (matched.length > 0) {
                filtered[area] = matched;
            }
        });
        
        const list = document.getElementById(`${type}CwacList`);
        if (list) {
            list.innerHTML = '';
            Object.keys(filtered).sort().forEach(area => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${area}</span> <span class="phone-badge">${filtered[area].length} members</span>`;
                li.addEventListener('click', () => showFilteredMembers(type, area, filtered[area]));
                list.appendChild(li);
            });
            
            if (Object.keys(filtered).length === 0) {
                const li = document.createElement('li');
                li.textContent = 'No matching members found';
                li.style.cursor = 'default';
                li.style.color = '#999';
                list.appendChild(li);
            }
        }
    }

    function showFilteredMembers(type, area, members) {
        const container = document.getElementById(type + 'Members');
        if (!container) return;
        
        container.innerHTML = '';
        
        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = `
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        `;
        
        const title = document.createElement('h3');
        title.textContent = `${area} - Filtered Results (${members.length} members)`;
        
        const backBtn = document.createElement('button');
        backBtn.innerHTML = '← Back to List';
        backBtn.className = 'home-button';
        backBtn.onclick = () => {
            container.innerHTML = '';
            populateCwacLists();
        };
        
        headerDiv.appendChild(title);
        headerDiv.appendChild(backBtn);
        container.appendChild(headerDiv);

        if (members.length > 0) {
            const membersDiv = document.createElement('div');
            membersDiv.className = 'virtual-scroll-container';
            membersDiv.id = `${type}VirtualScroll`;
            container.appendChild(membersDiv);
            
            const renderMember = (member, index) => {
                const card = document.createElement('div');
                card.className = `member-card ${type}`;
                card.innerHTML = `
                    <div class="member-header">
                        <span class="member-name">${index + 1}. ${member.name}</span>
                        <span class="member-badge badge-${type}">${type.toUpperCase()}</span>
                    </div>
                    <div class="member-details">
                        <div><strong>ID:</strong> ${member.id}</div>
                        <div><strong>Phone:</strong> <span class="phone-badge">📞 ${member.callNumber}</span></div>
                    </div>
                `;
                return card;
            };
            
            virtualScrollers[type] = new VirtualScroller(
                membersDiv, 
                members, 
                renderMember,
                120
            );
        }
    }

    const DebugPanel = {
        panel: null,
        content: null,
        timeout: null,
        
        init() {
            if (userRole !== 'admin') return;
            if (this.panel) return;
            
            this.panel = document.createElement('div');
            this.panel.id = 'debugPanel';
            this.panel.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 450px;
                max-height: 400px;
                background: #1e1e2f;
                border: 2px solid #4a90e2;
                border-radius: 12px;
                padding: 15px;
                font-family: 'Monaco', 'Menlo', monospace;
                font-size: 12px;
                z-index: 10000;
                box-shadow: 0 5px 20px rgba(0,0,0,0.5);
                color: #fff;
                display: none;
                overflow: hidden;
                flex-direction: column;
            `;
            
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #4a90e2;
            `;
            
            const title = document.createElement('span');
            title.innerHTML = '🔍 <strong>IMPORT/EXPORT REPORT</strong>';
            title.style.color = '#4a90e2';
            
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '✕';
            closeBtn.style.cssText = `
                background: none;
                border: none;
                color: #999;
                cursor: pointer;
                font-size: 16px;
                padding: 0 5px;
            `;
            closeBtn.onclick = () => this.hide();
            
            header.appendChild(title);
            header.appendChild(closeBtn);
            
            this.content = document.createElement('div');
            this.content.id = 'debugContent';
            this.content.style.cssText = `
                overflow-y: auto;
                flex-grow: 1;
                max-height: 280px;
                padding-right: 5px;
            `;
            
            const buttonArea = document.createElement('div');
            buttonArea.style.cssText = `
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #333;
                display: flex;
                gap: 10px;
            `;
            
            const reportBtn = document.createElement('button');
            reportBtn.innerHTML = '📊 Generate Full Report';
            reportBtn.style.cssText = `
                background: #4a90e2;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                flex: 1;
            `;
            reportBtn.onclick = () => this.generateReport();
            
            const clearBtn = document.createElement('button');
            clearBtn.innerHTML = '🗑️ Clear';
            clearBtn.style.cssText = `
                background: #444;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            `;
            clearBtn.onclick = () => this.clear();
            
            buttonArea.appendChild(reportBtn);
            buttonArea.appendChild(clearBtn);
            
            this.panel.appendChild(header);
            this.panel.appendChild(this.content);
            this.panel.appendChild(buttonArea);
            document.body.appendChild(this.panel);
        },
        
        show() {
            if (userRole !== 'admin') return;
            this.init();
            this.panel.style.display = 'flex';
            
            if (this.timeout) clearTimeout(this.timeout);
            this.timeout = setTimeout(() => this.hide(), 30000);
        },
        
        hide() {
            if (this.panel) {
                this.panel.style.display = 'none';
            }
        },
        
        clear() {
            if (this.content) {
                this.content.innerHTML = '';
            }
            this.hide();
        },
        
        log(message, data = null, type = 'info') {
            if (userRole !== 'admin') return;
            this.init();
            
            if (this.panel.style.display !== 'flex') {
                this.show();
            }
            
            const entry = document.createElement('div');
            entry.style.cssText = `
                border-bottom: 1px solid #333;
                padding: 8px 0;
                margin-bottom: 5px;
                font-size: 12px;
                animation: slideIn 0.3s ease;
            `;
            
            let color = '#fff';
            let icon = '•';
            if (type === 'success') {
                color = '#4caf50';
                icon = '✅';
            } else if (type === 'error') {
                color = '#f44336';
                icon = '❌';
            } else if (type === 'warning') {
                color = '#ff9800';
                icon = '⚠️';
            }
            
            const timestamp = new Date().toLocaleTimeString();
            let html = `<span style="color:#888;">[${timestamp}]</span> <span style="color:${color};">${icon} ${message}</span>`;
            
            if (data) {
                if (typeof data === 'object') {
                    html += `<pre style="background:#2a2a3a; color:#4af; padding:8px; margin:5px 0 0 0; border-radius:4px; font-size:11px; overflow-x:auto;">${JSON.stringify(data, null, 2)}</pre>`;
                } else {
                    html += ` <span style="color:#ffaa00;">${data}</span>`;
                }
            }
            
            entry.innerHTML = html;
            this.content.appendChild(entry);
            this.content.scrollTop = this.content.scrollHeight;
        },
        
        generateReport() {
            const totalUnpaid = Object.values(unpaidData).reduce((sum, arr) => sum + arr.length, 0);
            const totalStatus = Object.values(statusData).reduce((sum, arr) => sum + arr.length, 0);
            
            const report = {
                timestamp: new Date().toLocaleString(),
                summary: {
                    totalPaidMembers: Object.values(paidData).reduce((sum, arr) => sum + arr.length, 0),
                    totalUnpaidMembers: totalUnpaid,
                    totalStatusMembers: totalStatus,
                    paidAreas: Object.keys(paidData).length,
                    unpaidAreas: Object.keys(unpaidData).length,
                    statusAreas: Object.keys(statusData).length,
                    failedRecords: failedRecords.length
                },
                paidByArea: Object.keys(paidData).map(area => ({
                    area,
                    count: paidData[area].length,
                    members: paidData[area]
                })),
                unpaidByArea: Object.keys(unpaidData).map(area => ({
                    area,
                    count: unpaidData[area].length,
                    members: unpaidData[area]
                })),
                statusByArea: Object.keys(statusData).map(area => ({
                    area,
                    count: statusData[area].length,
                    members: statusData[area]
                })),
                failedRecords: failedRecords
            };
            
            this.log('📊 COMPLETE REPORT GENERATED', report, 'success');
            console.log('Cwac Manager Report:', report);
            showToast('Report generated and logged to console', 'success');
        }
    };

    function loadUnpaidMembersForEditing() {
        const editSection = document.getElementById('edit');
        if (!editSection) return;
        
        const totalUnpaid = Object.values(unpaidData).reduce((sum, arr) => sum + arr.length, 0);
        
        editSection.innerHTML = `
            <h2>Edit Unpaid Member Call Numbers</h2>
            
            <button onclick="goToLandingPage()" class="home-button">
                🏠 Return to Home
            </button>
            
            <div class="import-section">
                <h3 style="color: #ff9800;">📞 BULK PHONE NUMBER UPDATE</h3>
                <p style="margin-bottom: 15px;">Update phone numbers for unpaid members below</p>
                
                <div class="filter-group">
                    <span><strong>Filter by Area:</strong></span>
                    <select id="areaFilter" style="flex: 1;">
                        <option value="all">All Areas (${totalUnpaid})</option>
                        ${Object.keys(unpaidData).sort().map(area => `<option value="${area}">${area} (${unpaidData[area].length})</option>`).join('')}
                    </select>
                </div>
            </div>
            
            <div id="unpaidMembersList" style="max-height: 500px; overflow-y: auto; padding-right: 5px;"></div>
            
            ${userRole === 'admin' ? `
            <div class="export-section">
                <button id="downloadUpdatedBtn" style="background: #4caf50; width: 100%; padding: 15px;">
                    💾 Download Updated List
                </button>
            </div>
            ` : ''}
            
            <div id="editMessage" style="margin-top: 10px;"></div>
        `;
        
        const listDiv = document.getElementById('unpaidMembersList');
        
        if (totalUnpaid === 0) {
            listDiv.innerHTML = '<div class="alert alert-info">✅ No unpaid members to edit!</div>';
            return;
        }
        
        const membersContainer = document.createElement('div');
        membersContainer.id = 'membersContainer';
        listDiv.appendChild(membersContainer);
        
        displayUnpaidMembers('all');
        
        document.getElementById('areaFilter')?.addEventListener('change', (e) => {
            displayUnpaidMembers(e.target.value);
        });
        
        if (userRole === 'admin') {
            document.getElementById('downloadUpdatedBtn')?.addEventListener('click', downloadUpdatedUnpaidList);
        }
    }
    
    function displayUnpaidMembers(area) {
        const container = document.getElementById('membersContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        let membersToShow = [];
        
        if (area === 'all') {
            Object.keys(unpaidData).sort().forEach(cwacArea => {
                unpaidData[cwacArea].forEach((member, index) => {
                    membersToShow.push({
                        ...member,
                        cwacArea,
                        originalIndex: index,
                        uniqueId: `${cwacArea}_${index}`
                    });
                });
            });
        } else {
            if (unpaidData[area]) {
                unpaidData[area].forEach((member, index) => {
                    membersToShow.push({
                        ...member,
                        cwacArea: area,
                        originalIndex: index,
                        uniqueId: `${area}_${index}`
                    });
                });
            }
        }
        
        if (membersToShow.length === 0) {
            container.innerHTML = '<div class="alert alert-info">No members in this area</div>';
            return;
        }
        
        membersToShow.forEach((member) => {
            const memberCard = document.createElement('div');
            memberCard.className = 'member-card unpaid';
            memberCard.id = `member_${member.uniqueId}`;
            
            memberCard.innerHTML = `
                <div class="member-header">
                    <span class="member-name">${member.name}</span>
                    <span class="member-badge badge-unpaid">UNPAID</span>
                </div>
                <div class="member-details">
                    <div><strong>ID:</strong> ${member.id}</div>
                    <div><strong>CWAC:</strong> ${member.cwacArea}</div>
                    <div><strong>Current Phone:</strong> <span class="phone-badge" id="currentPhone_${member.uniqueId}">📞 ${member.callNumber}</span></div>
                    <div style="grid-column: 1 / -1; margin-top: 5px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 5px;">Edit Phone Number:</label>
                        <input type="text" 
                               id="edit_${member.uniqueId}" 
                               value="${member.callNumber}" 
                               class="phone-input-field"
                               placeholder="Enter 9-digit number"
                               oninput="this.value=this.value.replace(/\\D/g,'').slice(0,9).replace(/^0+/, '')">
                        <button onclick="updateMemberPhone('${member.cwacArea}', ${member.originalIndex}, '${member.uniqueId}')" 
                                class="update-phone-btn">Update Phone</button>
                    </div>
                </div>
                <div id="status_${member.uniqueId}" style="margin-top: 8px; font-size: 12px;"></div>
            `;
            
            container.appendChild(memberCard);
        });
    }

    window.updateMemberPhone = async function(area, memberIndex, uniqueId) {
        const input = document.getElementById(`edit_${uniqueId}`);
        const statusDiv = document.getElementById(`status_${uniqueId}`);
        const currentPhoneSpan = document.getElementById(`currentPhone_${uniqueId}`);
        
        if (!input || !unpaidData[area] || !unpaidData[area][memberIndex]) {
            showToast('Member not found!', 'error');
            return;
        }
        
        const newNumber = input.value.replace(/\D/g, '');
        
        if (newNumber.length !== 9) {
            statusDiv.innerHTML = '<span style="color: #f44336;">❌ Phone must be 9 digits</span>';
            return;
        }
        
        if (newNumber[0] === '0') {
            statusDiv.innerHTML = '<span style="color: #f44336;">❌ Number cannot start with 0</span>';
            return;
        }
        
        const member = unpaidData[area][memberIndex];
        const oldNumber = member.callNumber;
        
        member.callNumber = newNumber;
        
        currentPhoneSpan.innerHTML = `📞 ${newNumber}`;
        statusDiv.innerHTML = '<span style="color: #4caf50;">✅ Phone number updated!</span>';
        input.value = newNumber;
        
        const saved = await savePhoneNumberEdit(
            area, 
            memberIndex, 
            oldNumber, 
            newNumber, 
            member.name, 
            member.id
        );
        
        if (saved) {
            showToast(`Phone updated for ${member.name}`, 'success');
            
            if (userRole === 'admin') {
                DebugPanel.log(`📞 Updated phone for ${member.name}: ${oldNumber} → ${newNumber}`, null, 'success');
            }
        } else {
            statusDiv.innerHTML += '<br><span style="color: #ff9800;">⚠️ Will sync when online</span>';
            saveDataToLocal();
        }
    };

    function downloadUpdatedUnpaidList() {
        if (userRole !== 'admin') {
            showToast('Only administrators can download lists', 'error');
            return;
        }
        
        const totalUnpaid = Object.values(unpaidData).reduce((sum, arr) => sum + arr.length, 0);
        
        if (totalUnpaid === 0) {
            showAlert('editMessage', 'No unpaid members to download', 'warning');
            return;
        }
        
        let csvContent = "Name,ID,CallNumber,CwacArea,Status\n";
        let updatedCount = 0;
        
        Object.keys(unpaidData).sort().forEach(cwacArea => {
            unpaidData[cwacArea].forEach(member => {
                const name = member.name.includes(',') ? `"${member.name}"` : member.name;
                const id = member.id.includes(',') ? `"${member.id}"` : member.id;
                csvContent += `${name},${id},${member.callNumber},${cwacArea},UNPAID\n`;
                updatedCount++;
            });
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `updated_unpaid_members_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        
        showAlert('editMessage', `✅ Downloaded ${updatedCount} updated unpaid members!`, 'success');
        showToast(`Downloaded ${updatedCount} members`, 'success');
        
        if (userRole === 'admin') {
            DebugPanel.log(`📤 Downloaded ${updatedCount} updated unpaid members`, null, 'success');
        }
    }

    function loadStatusMembers() {
        const statusSection = document.getElementById('status');
        if (!statusSection) return;
        
        const totalStatus = Object.values(statusData).reduce((sum, arr) => sum + arr.length, 0);
        
        statusSection.innerHTML = `
            <h2>Member Status Management</h2>
            
            <button onclick="goToLandingPage()" class="home-button">
                🏠 Return to Home
            </button>
            
            ${userRole === 'admin' ? `
            <div class="import-section">
                <h3 style="color: #2196f3;">📤 Upload Status Data</h3>
                <p style="margin-bottom: 15px;">Upload CSV file with member status information (leave Status column blank)</p>
                
                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <input type="file" id="statusCsvFile" accept=".csv" style="flex: 1;">
                    <button id="importStatusBtn" style="background: #2196f3;">📤 Upload Status CSV</button>
                </div>
                <div id="statusImportMessage" style="margin-top: 10px;"></div>
            </div>
            
            <div class="export-section">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                    <div>
                        <h3 style="margin: 0; color: #2e7d32;">📊 Export Status Data</h3>
                        <p style="margin: 5px 0 0; font-size: 13px;">Download current member status with Alive/Deceased selections</p>
                    </div>
                    <button id="exportStatusBtn" 
                            style="background: #4caf50; padding: 12px 30px; font-size: 16px; ${totalStatus === 0 ? 'opacity: 0.5;' : ''}" 
                            ${totalStatus === 0 ? 'disabled' : ''}>
                        💾 DOWNLOAD STATUS LIST (CSV)
                    </button>
                </div>
                ${totalStatus === 0 ? '<p style="color: #f44336; margin: 10px 0 0;">⚠️ Upload data first to enable export</p>' : ''}
            </div>
            ` : `
            <div class="alert alert-success" style="margin-bottom: 20px; background: #d4edda; color: #155724;">
                <strong>✅ Update Member Status</strong> - Click Alive or Deceased buttons below to update member status.
            </div>
            `}
            
            ${totalStatus > 0 ? `
            <div class="filter-section">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                    <span><strong>📊 Total Members: ${totalStatus}</strong></span>
                    <div class="filter-group">
                        <label><input type="radio" name="statusFilter" value="all" checked> All</label>
                        <label><input type="radio" name="statusFilter" value="ALIVE"> Alive</label>
                        <label><input type="radio" name="statusFilter" value="DECEASED"> Deceased</label>
                    </div>
                    <select id="statusAreaFilter" style="padding: 8px; border-radius: 8px; min-width: 200px;">
                        <option value="all">All Areas</option>
                        ${Object.keys(statusData).sort().map(area => `<option value="${area}">${area} (${statusData[area].length})</option>`).join('')}
                    </select>
                </div>
            </div>
            
            <div id="statusMembersList" style="max-height: 500px; overflow-y: auto; padding-right: 5px;"></div>
            ` : `
            <div style="text-align: center; padding: 60px; background: #f5f5f5; border-radius: 16px;">
                <span style="font-size: 48px;">📊</span>
                <p style="color: #666; font-size: 18px; margin-top: 15px;">No status data available.</p>
                ${userRole === 'admin' ? '<p style="color: #999;">Please upload a CSV file above.</p>' : 
                  '<p style="color: #999;">Please contact an administrator to upload data.</p>'}
            </div>
            `}
            
            <div id="statusMessage" style="margin-top: 10px;"></div>
        `;
        
        if (totalStatus > 0) {
            const listDiv = document.getElementById('statusMembersList');
            
            const membersContainer = document.createElement('div');
            membersContainer.id = 'statusMembersContainer';
            listDiv.appendChild(membersContainer);
            
            displayStatusMembers('all', 'all');
            
            document.querySelectorAll('input[name="statusFilter"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    const areaFilter = document.getElementById('statusAreaFilter').value;
                    const statusFilter = document.querySelector('input[name="statusFilter"]:checked').value;
                    displayStatusMembers(areaFilter, statusFilter);
                });
            });
            
            document.getElementById('statusAreaFilter')?.addEventListener('change', (e) => {
                const statusFilter = document.querySelector('input[name="statusFilter"]:checked').value;
                displayStatusMembers(e.target.value, statusFilter);
            });
        }
        
        if (userRole === 'admin') {
            document.getElementById('importStatusBtn')?.addEventListener('click', importStatusCSV);
            document.getElementById('exportStatusBtn')?.addEventListener('click', exportStatusList);
        }
    }

    function displayStatusMembers(area, statusFilter) {
        const container = document.getElementById('statusMembersContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        let membersToShow = [];
        
        if (area === 'all') {
            Object.keys(statusData).sort().forEach(cwacArea => {
                statusData[cwacArea].forEach((member, index) => {
                    if (statusFilter === 'all' || member.status === statusFilter) {
                        membersToShow.push({
                            ...member,
                            cwacArea,
                            originalIndex: index,
                            uniqueId: `${cwacArea}_${index}`
                        });
                    }
                });
            });
        } else {
            if (statusData[area]) {
                statusData[area].forEach((member, index) => {
                    if (statusFilter === 'all' || member.status === statusFilter) {
                        membersToShow.push({
                            ...member,
                            cwacArea: area,
                            originalIndex: index,
                            uniqueId: `${area}_${index}`
                        });
                    }
                });
            }
        }
        
        if (membersToShow.length === 0) {
            container.innerHTML = '<div class="alert alert-info">No members match the selected filters</div>';
            return;
        }
        
        membersToShow.forEach((member) => {
            const memberCard = document.createElement('div');
            memberCard.className = `status-card ${member.status === 'ALIVE' ? 'alive' : 'deceased'}`;
            
            memberCard.innerHTML = `
                <div class="status-header">
                    <span class="member-name">${member.name}</span>
                    <span class="status-badge ${member.status === 'ALIVE' ? 'alive' : 'deceased'}">
                        ${member.status === 'ALIVE' ? '❤️ ALIVE' : '💔 DECEASED'}
                    </span>
                </div>
                <div class="status-details">
                    <div><strong>ID:</strong> ${member.id}</div>
                    <div><strong>CWAC:</strong> ${member.cwacArea}</div>
                    <div><strong>Phone:</strong> <span class="phone-badge">📞 ${member.callNumber}</span></div>
                </div>
                <div class="status-actions">
                    <button onclick="updateMemberStatus('${member.cwacArea}', ${member.originalIndex}, 'ALIVE')" 
                            class="btn-alive">❤️ Alive</button>
                    <button onclick="updateMemberStatus('${member.cwacArea}', ${member.originalIndex}, 'DECEASED')" 
                            class="btn-deceased">💔 Deceased</button>
                </div>
            `;
            
            container.appendChild(memberCard);
        });
    }

    window.updateMemberStatus = async function(area, memberIndex, newStatus) {
        if (!statusData[area] || !statusData[area][memberIndex]) {
            showToast('Member not found!', 'error');
            return;
        }
        
        const member = statusData[area][memberIndex];
        const oldStatus = member.status;
        
        member.status = newStatus;
        
        const saved = await saveStatusUpdate(
            area, 
            memberIndex, 
            newStatus, 
            member.name, 
            member.id
        );
        
        const statusFilter = document.querySelector('input[name="statusFilter"]:checked').value;
        const areaFilter = document.getElementById('statusAreaFilter').value;
        displayStatusMembers(areaFilter, statusFilter);
        
        if (saved) {
            showToast(`Status updated for ${member.name}`, 'success');
            
            if (userRole === 'admin') {
                DebugPanel.log(`📊 Updated status for ${member.name}: ${oldStatus} → ${newStatus}`, null, 'success');
            }
        } else {
            showToast('Status saved locally - will sync when online', 'warning');
            saveDataToLocal();
        }
    };

    function importStatusCSV() {
        if (userRole !== 'admin') {
            showToast('Import function is only available for administrators.', 'error');
            return;
        }
        
        const fileInput = document.getElementById('statusCsvFile');
        if (!fileInput || fileInput.files.length === 0) {
            showToast('Please select a CSV file first.', 'warning');
            return;
        }
        
        const file = fileInput.files[0];
        showLoading('statusImportMessage', 'Processing file...');
        
        const reader = new FileReader();
        
        reader.onload = async function (e) {
            try {
                const content = e.target.result;
                const rows = content.split('\n').filter(row => row.trim() !== '');
                
                statusData = {};
                const batch = db.batch();
                
                let importedCount = 0;
                let skippedCount = 0;
                
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i].trim();
                    if (!row) continue;
                    
                    const cols = row.split(',').map(col => col.trim());
                    
                    if (cols.length < 4) {
                        skippedCount++;
                        continue;
                    }
                    
                    const name = cols[0];
                    const id = cols[1];
                    let callNumber = cols[2];
                    const cwacArea = cols[3];
                    let status = cols[4] ? cols[4].toUpperCase() : 'ALIVE';
                    
                    if (status !== 'ALIVE' && status !== 'DECEASED') {
                        status = 'ALIVE';
                    }
                    
                    const cleanPhone = callNumber.replace(/\D/g, '');
                    
                    const member = { name, id, callNumber: cleanPhone, status };
                    
                    if (!statusData[cwacArea]) statusData[cwacArea] = [];
                    statusData[cwacArea].push(member);
                    
                    const statusRef = db.collection('Status').doc(id);
                    batch.set(statusRef, {
                        name: name,
                        id: id,
                        callNumber: cleanPhone,
                        cwacArea: cwacArea,
                        status: status,
                        importedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        importedBy: userRole
                    }, { merge: true });
                    
                    importedCount++;
                }
                
                await batch.commit();
                
                Object.keys(statusData).forEach(cwac => {
                    statusData[cwac].sort((a, b) => a.name.localeCompare(b.name));
                });
                
                document.getElementById('statusImportMessage').innerHTML = 
                    `<div class="alert alert-success">✅ Imported ${importedCount} members (${skippedCount} skipped)</div>`;
                
                loadStatusMembers();
                showDataStats();
                showToast(`Imported ${importedCount} members`, 'success');
                
                DebugPanel.log('📊 STATUS IMPORT SUMMARY', {
                    imported: importedCount,
                    skipped: skippedCount,
                    areas: Object.keys(statusData).length
                }, 'success');
                
                saveDataToLocal();
                
            } catch (error) {
                console.error('Import error:', error);
                document.getElementById('statusImportMessage').innerHTML = 
                    `<div class="alert alert-error">❌ Error importing file: ${error.message}</div>`;
                showToast('Error importing file', 'error');
            }
        };
        
        reader.readAsText(file);
    }

    function exportStatusList() {
        if (userRole !== 'admin') {
            showToast('Export function is only available for administrators.', 'error');
            return;
        }
        
        if (Object.keys(statusData).length === 0) {
            showToast('No status data to export!', 'warning');
            return;
        }
        
        DebugPanel.log('📤 Exporting status list...');
        
        let csvContent = "Name,ID,CallNumber,CwacArea,Status\n";
        let totalExported = 0;
        
        Object.keys(statusData).sort().forEach(cwacArea => {
            statusData[cwacArea].forEach(member => {
                const escapedName = member.name.includes(',') ? `"${member.name}"` : member.name;
                const escapedId = member.id.includes(',') ? `"${member.id}"` : member.id;
                csvContent += `${escapedName},${escapedId},${member.callNumber},${cwacArea},${member.status}\n`;
                totalExported++;
            });
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `member_status_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        
        showAlert('statusMessage', `✅ Exported ${totalExported} members`, 'success');
        showToast(`Exported ${totalExported} members`, 'success');
        DebugPanel.log(`✅ Status export complete: ${totalExported} members`, null, 'success');
    }

    async function importCSV(file) {
        if (userRole !== 'admin') {
            showToast('Import function is only available for administrators.', 'error');
            return;
        }
        
        showLoading('importMessage', 'Processing file...');
        DebugPanel.log('📁 Importing file:', file.name);
        
        try {
            const rows = await readLargeCSV(file);
            
            failedRecords = [];
            paidData = {};
            unpaidData = {};
            
            let importedCount = 0;
            let skippedCount = 0;
            
            const batch = db.batch();
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i].trim();
                if (!row) continue;
                
                const cols = row.split(',').map(col => col.trim());
                const rowNumber = i + 1;
                
                if (cols.length < 5) {
                    failedRecords.push({
                        row: rowNumber,
                        data: row,
                        reason: 'Insufficient columns'
                    });
                    skippedCount++;
                    continue;
                }
                
                const name = cols[0];
                const id = cols[1];
                let callNumber = cols[2];
                const cwacArea = cols[3];
                let status = cols[4].toUpperCase();
                
                const cleanPhone = callNumber.replace(/\D/g, '');
                const isValidPhone = cleanPhone.length === 9 && cleanPhone[0] !== '0';
                
                if (!isValidPhone) {
                    failedRecords.push({
                        row: rowNumber,
                        name,
                        id,
                        callNumber: callNumber,
                        cwacArea,
                        status,
                        reason: 'Invalid phone number',
                        suggestedFix: cleanPhone
                    });
                    skippedCount++;
                    continue;
                }
                
                if (status !== 'PAID' && status !== 'UNPAID') {
                    failedRecords.push({
                        row: rowNumber,
                        name,
                        id,
                        callNumber: cleanPhone,
                        cwacArea,
                        status,
                        reason: 'Invalid status'
                    });
                    skippedCount++;
                    continue;
                }
                
                const member = { name, id, callNumber: cleanPhone };
                
                if (status === 'PAID') {
                    if (!paidData[cwacArea]) paidData[cwacArea] = [];
                    paidData[cwacArea].push(member);
                    
                    const memberRef = db.collection('PaidMembers').doc(id);
                    batch.set(memberRef, {
                        name: name,
                        id: id,
                        callNumber: cleanPhone,
                        cwacArea: cwacArea,
                        status: 'PAID',
                        importedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        importedBy: userRole,
                        importBatch: `batch_${Date.now()}`
                    });
                    
                } else {
                    if (!unpaidData[cwacArea]) unpaidData[cwacArea] = [];
                    unpaidData[cwacArea].push(member);
                    
                    const memberRef = db.collection('UnpaidMembers').doc(id);
                    batch.set(memberRef, {
                        name: name,
                        id: id,
                        callNumber: cleanPhone,
                        cwacArea: cwacArea,
                        status: 'UNPAID',
                        needsReview: true,
                        importedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        importedBy: userRole,
                        importBatch: `batch_${Date.now()}`
                    });
                }
                
                importedCount++;
            }
            
            await batch.commit();
            
            Object.keys(paidData).forEach(cwac => {
                paidData[cwac].sort((a, b) => a.name.localeCompare(b.name));
            });
            Object.keys(unpaidData).forEach(cwac => {
                unpaidData[cwac].sort((a, b) => a.name.localeCompare(b.name));
            });
            
            const totalUnpaid = Object.values(unpaidData).reduce((sum, arr) => sum + arr.length, 0);
            
            hideLoading('importMessage');
            document.getElementById('importMessage').innerHTML = 
                `<div class="alert alert-success">✅ Imported: ${importedCount} | Failed: ${skippedCount} | Unpaid: ${totalUnpaid}</div>`;
            
            populateCwacLists();
            showDataStats();
            showToast(`Imported ${importedCount} members`, 'success');
            
            DebugPanel.log('📊 IMPORT SUMMARY', {
                imported: importedCount,
                skipped: skippedCount,
                failedRecords: failedRecords.length,
                paidAreas: Object.keys(paidData).length,
                unpaidAreas: Object.keys(unpaidData).length,
                totalUnpaidMembers: totalUnpaid
            }, 'success');
            
            saveDataToLocal();
            
        } catch (error) {
            console.error('Import error:', error);
            hideLoading('importMessage');
            document.getElementById('importMessage').innerHTML = 
                `<div class="alert alert-error">❌ Error importing file: ${error.message}</div>`;
            showToast('Error importing file', 'error');
        }
    }

    function populateCwacLists() {
        const paidList = document.getElementById('paidCwacList');
        const unpaidList = document.getElementById('unpaidCwacList');

        if (!paidList || !unpaidList) return;

        paidList.innerHTML = '';
        unpaidList.innerHTML = '';

        const paidAreas = Object.keys(paidData).sort();
        const unpaidAreas = Object.keys(unpaidData).sort();

        if (paidAreas.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No paid CWAC areas yet';
            li.style.cursor = 'default';
            li.style.color = '#999';
            paidList.appendChild(li);
        } else {
            paidAreas.forEach(cwac => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${cwac}</span> <span class="phone-badge">${paidData[cwac].length} members</span>`;
                li.addEventListener('click', () => showMembers('paid', cwac));
                paidList.appendChild(li);
            });
        }

        if (unpaidAreas.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No unpaid CWAC areas yet';
            li.style.cursor = 'default';
            li.style.color = '#999';
            unpaidList.appendChild(li);
        } else {
            unpaidAreas.forEach(cwac => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${cwac}</span> <span class="phone-badge">${unpaidData[cwac].length} members</span>`;
                li.addEventListener('click', () => showMembers('unpaid', cwac));
                unpaidList.appendChild(li);
            });
        }
    }

    function showMembers(type, cwac) {
        const container = document.getElementById(type + 'Members');
        if (!container) return;
        
        container.innerHTML = '';

        const members = type === 'paid' ? paidData[cwac] : unpaidData[cwac];
        
        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = `
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        `;
        
        const title = document.createElement('h3');
        title.textContent = `${cwac} - ${type === 'paid' ? 'Paid' : 'Unpaid'} Members (${members.length})`;
        
        const backBtn = document.createElement('button');
        backBtn.innerHTML = '← Back to List';
        backBtn.className = 'home-button';
        backBtn.onclick = () => {
            container.innerHTML = '';
            populateCwacLists();
        };
        
        headerDiv.appendChild(title);
        headerDiv.appendChild(backBtn);
        container.appendChild(headerDiv);

        if (members && members.length > 0) {
            const membersDiv = document.createElement('div');
            membersDiv.className = 'virtual-scroll-container';
            membersDiv.id = `${type}DetailVirtualScroll`;
            container.appendChild(membersDiv);
            
            const renderMember = (member, index) => {
                const card = document.createElement('div');
                card.className = `member-card ${type}`;
                card.innerHTML = `
                    <div class="member-header">
                        <span class="member-name">${index + 1}. ${member.name}</span>
                        <span class="member-badge badge-${type}">${type.toUpperCase()}</span>
                    </div>
                    <div class="member-details">
                        <div><strong>ID:</strong> ${member.id}</div>
                        <div><strong>Phone:</strong> <span class="phone-badge">📞 ${member.callNumber}</span></div>
                    </div>
                `;
                return card;
            };
            
            virtualScrollers[`${type}Detail`] = new VirtualScroller(
                membersDiv, 
                members, 
                renderMember,
                120
            );
        }
    }

    function exportCSV(data, filename) {
        if (userRole !== 'admin') {
            showToast('Export function is only available for administrators.', 'error');
            return;
        }
        
        if (Object.keys(data).length === 0) {
            showToast('No data to export!', 'warning');
            return;
        }
        
        DebugPanel.log(`📤 Exporting ${filename}...`);
        
        let csvContent = "Name,ID,CallNumber,CwacArea,Status\n";
        const status = (data === paidData) ? "PAID" : "UNPAID";
        let totalExported = 0;

        Object.keys(data).sort().forEach(cwac => {
            data[cwac].forEach(member => {
                const escapedName = member.name.includes(',') ? `"${member.name}"` : member.name;
                const escapedId = member.id.includes(',') ? `"${member.id}"` : member.id;
                csvContent += `${escapedName},${escapedId},${member.callNumber},${cwac},${status}\n`;
                totalExported++;
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();

        showAlert('exportMessage', `✅ Exported ${totalExported} members`, 'success');
        showToast(`Exported ${totalExported} members`, 'success');
        DebugPanel.log(`✅ Export complete: ${totalExported} members to ${filename}`, null, 'success');
    }

    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('csvFile');
            if (fileInput && fileInput.files.length > 0) {
                importCSV(fileInput.files[0]);
            } else {
                showToast('Please select a CSV file first.', 'warning');
            }
        });
    }

    const exportPaidBtn = document.getElementById('exportPaidBtn');
    if (exportPaidBtn) {
        exportPaidBtn.addEventListener('click', () => {
            exportCSV(paidData, `paid_members_${new Date().toISOString().slice(0,10)}.csv`);
        });
    }

    const exportUnpaidBtn = document.getElementById('exportUnpaidBtn');
    if (exportUnpaidBtn) {
        exportUnpaidBtn.addEventListener('click', () => {
            exportCSV(unpaidData, `unpaid_members_${new Date().toISOString().slice(0,10)}.csv`);
        });
    }
});