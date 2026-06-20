/*
Token and API management for JWT-based authentication.
Handles storing/retrieving tokens and adding Authorization headers to requests.
*/

function getApiBaseUrl() {
    if (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    ) {
        return 'http://localhost:3000';
    }

    return localStorage.getItem('apiBaseUrl')
        || 'https://sodv1201s26group1project-api.onrender.com';
}

const API_BASE_URL = getApiBaseUrl();

// Get stored JWT token
function getToken() {
    return localStorage.getItem('token');
}

// Store JWT token
function setToken(token) {
    localStorage.setItem('token', token);
}

// Clear all auth data
function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    localStorage.removeItem('email');
    localStorage.removeItem('role');
    localStorage.removeItem('name');
}

// Check if user is authenticated
function isAuthenticated() {
    return !!getToken();
}

// Make API request with automatic token in Authorization header
async function apiRequest(path, options = {}) {
    const url = `${API_BASE_URL}${path}`;
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Add Authorization header if token exists
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers,
        });

        const data = await response.json();

        // Handle token expiration (401 Unauthorized)
        if (response.status === 401) {
            clearAuth();
            window.location.href = 'login.html';
            return null;
        }

        return {
            status: response.status,
            data,
        };
    } catch (error) {
        console.error('API request failed:', error);
        return null;
    }
}

// GET request helper
function apiGet(path) {
    return apiRequest(path, { method: 'GET' });
}

// POST request helper
function apiPost(path, body) {
    return apiRequest(path, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}

// PUT request helper
function apiPut(path, body) {
    return apiRequest(path, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
}

// DELETE request helper
function apiDelete(path, body) {
    return apiRequest(path, {
        method: 'DELETE',
        body: JSON.stringify(body),
    });
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
    }
}
