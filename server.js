/*
AI declaration:
GitHub Copilot was used to help draft code, explain parts of the assignment by drawing parallels to PLC programming and robotics principles, and help fix errors and refine the code. GitHub Copilot was also used to guide API testing workflows in Postman and support UI testing checks in VS Code.
Technical background: PLC programming and robotics systems.
*/

const express = require('express');
const bcrypt = require('bcryptjs');
const app = express();

const users = [];
const properties = [];
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const allowedRoles = new Set(['owner', 'coworker']);
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,}$/;
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

const isValidPassword = (value) => passwordPattern.test(String(value || ''));

function resetState() {
    users.length = 0;
    properties.length = 0;
    loginAttempts.clear();
}

app.use(express.json());
app.use(express.static('public'));

app.post('/register', async (req, res) => {
    const { name, phone, email, password, role } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (!isValidPassword(password)) {
        return res.json({
            success: false,
            message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
        });
    }

    if (!allowedRoles.has(normalizedRole)) {
        return res.json({ success: false, message: 'Invalid role selected' });
    }

    const exists = users.find(u => normalizeEmail(u.email) === normalizedEmail);
    if (exists) {
        return res.json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ name, phone, email: normalizedEmail, password: hashedPassword, role: normalizedRole });
    res.json({ success: true, message: 'User registered!' });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const now = Date.now();
    const attemptRecord = loginAttempts.get(normalizedEmail);

    if (!normalizedEmail || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (attemptRecord && attemptRecord.lockUntil && attemptRecord.lockUntil > now) {
        return res.status(429).json({
            success: false,
            message: 'Too many failed login attempts. Please try again later.'
        });
    }

    if (attemptRecord && attemptRecord.lockUntil && attemptRecord.lockUntil <= now) {
        loginAttempts.delete(normalizedEmail);
    }

    const user = users.find(u => normalizeEmail(u.email) === normalizedEmail);

    if (!user) {
        loginAttempts.set(normalizedEmail, {
            count: (attemptRecord?.count || 0) + 1,
            lockUntil: (attemptRecord?.count || 0) + 1 >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_LOCKOUT_MS : null
        });
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (passwordMatches) {
        loginAttempts.delete(normalizedEmail);
        res.json({ success: true, role: user.role, name: user.name });
    } else {
        const nextCount = (attemptRecord?.count || 0) + 1;
        loginAttempts.set(normalizedEmail, {
            count: nextCount,
            lockUntil: nextCount >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_LOCKOUT_MS : null
        });
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/properties', (req, res) => {
    const { email, address, neighborhood, squareFootage, garage, publicTransport } = req.body;
    const normalizedEmail = normalizeEmail(email);
    properties.push({ email: normalizedEmail, address, neighborhood, squareFootage, garage, publicTransport, workspaces: [] });
    res.json({ success: true, message: 'Property added!' });
});

app.get('/properties', (req, res) => {
    const email = normalizeEmail(req.query.email);
    const userProperties = properties
        .map((property, propertyIndex) => ({ ...property, propertyIndex }))
        .filter(property => normalizeEmail(property.email) === email);
    res.json({ success: true, properties: userProperties });
});

app.delete('/properties/:index', (req, res) => {
    const email = normalizeEmail(req.body.email);
    const index = parseInt(req.params.index, 10);

    if (!Number.isInteger(index)) {
        return res.status(400).json({ success: false, message: 'Invalid property index.' });
    }

    const property = properties[index];

    if (index >= 0 && property && normalizeEmail(property.email) === email) {
        properties.splice(index, 1);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Property not found' });
    }
});

app.post('/workspaces', (req, res) => {
    const { email, propertyIndex, type, capacity, smoking, availability, leaseTerm, price } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const parsedPropertyIndex = Number(propertyIndex);

    if (!Number.isInteger(parsedPropertyIndex) || parsedPropertyIndex < 0 || parsedPropertyIndex >= properties.length) {
        return res.json({ success: false, message: 'Property not found' });
    }

    const property = properties[parsedPropertyIndex];
    if (!property || normalizeEmail(property.email) !== normalizedEmail) {
        return res.json({ success: false, message: 'Property not found for this owner.' });
    }

    if (type && capacity && smoking && availability && leaseTerm && price) {
        property.workspaces.push({ type, capacity, smoking, availability, leaseTerm, price, ownerEmail: normalizedEmail });
        res.json({ success: true, message: 'Workspace added!' });
    } else {
        res.json({ success: false, message: 'Please fill in all required workspace fields.' });
    }
});

app.put('/workspaces/:propertyIndex/:workspaceIndex', (req, res) => {
    const { email, type, capacity, smoking, availability, leaseTerm, price } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const propertyIndex = Number(req.params.propertyIndex);
    const workspaceIndex = Number(req.params.workspaceIndex);

    if (!Number.isInteger(propertyIndex) || !Number.isInteger(workspaceIndex) || propertyIndex < 0 || workspaceIndex < 0) {
        return res.json({ success: false, message: 'Invalid workspace selection.' });
    }

    const property = properties[propertyIndex];
    if (!property || normalizeEmail(property.email) !== normalizedEmail) {
        return res.json({ success: false, message: 'Property not found for this owner.' });
    }

    const normalizedType = (type || '').trim();
    const normalizedSmoking = (smoking || '').trim();
    const normalizedAvailability = (availability || '').trim();
    const normalizedLeaseTerm = (leaseTerm || '').trim();
    const parsedCapacity = Number(capacity);
    const parsedPrice = Number(price);

    if (!normalizedType || !Number.isFinite(parsedCapacity) || parsedCapacity < 1 || !normalizedSmoking || !normalizedAvailability || !normalizedLeaseTerm || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        return res.json({ success: false, message: 'All workspace fields are required.' });
    }

    if (!property.workspaces || workspaceIndex >= property.workspaces.length) {
        return res.json({ success: false, message: 'Workspace not found.' });
    }

    property.workspaces[workspaceIndex] = {
        ...property.workspaces[workspaceIndex],
        type: normalizedType,
        capacity: parsedCapacity,
        smoking: normalizedSmoking,
        availability: normalizedAvailability,
        leaseTerm: normalizedLeaseTerm,
        price: parsedPrice,
        ownerEmail: normalizedEmail
    };

    res.json({ success: true, message: 'Workspace updated!' });
});

app.delete('/workspaces/:propertyIndex/:workspaceIndex', (req, res) => {
    const email = normalizeEmail(req.body.email);
    const propertyIndex = Number(req.params.propertyIndex);
    const workspaceIndex = Number(req.params.workspaceIndex);

    if (!Number.isInteger(propertyIndex) || !Number.isInteger(workspaceIndex) || propertyIndex < 0 || workspaceIndex < 0) {
        return res.json({ success: false, message: 'Invalid workspace selection.' });
    }

    const property = properties[propertyIndex];
    if (!property || normalizeEmail(property.email) !== email) {
        return res.json({ success: false, message: 'Property not found for this owner.' });
    }

    if (!property.workspaces || workspaceIndex >= property.workspaces.length) {
        return res.json({ success: false, message: 'Workspace not found.' });
    }   

    property.workspaces.splice(workspaceIndex, 1);
    res.json({ success: true, message: 'Workspace deleted!' });
});

app.get('/workspaces', (req, res) => {
    const allWorkspaces = [];
    properties.forEach((p, pIndex) => {
        p.workspaces.forEach((w, wIndex) => {
            allWorkspaces.push({ ...w, propertyIndex: pIndex, workspaceIndex: wIndex, address: p.address, neighborhood: p.neighborhood, ownerEmail: p.email });
        });
    });
    res.json({ success: true, workspaces: allWorkspaces });
});

if (require.main === module) {
    app.listen(3000, () => {
        console.log('Server running on port 3000');
    });
}

module.exports = {
    app,
    resetState
};