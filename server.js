const express = require('express');
const app = express();

const users = [];
const properties = [];

app.use(express.json());
app.use(express.static('public'));

app.post('/register', (req, res) => {
    const { name, phone, email, password, role } = req.body;
    const exists = users.find(u => u.email === email);
    if (exists) {
        return res.json({ success: false, message: 'Email already registered' });
    }
    users.push({ name, phone, email, password, role });
    res.json({ success: true, message: 'User registered!' });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        res.json({ success: true, role: user.role, name: user.name });
    } else {
        res.json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/properties', (req, res) => {
    const { email, address, neighborhood, squareFootage, garage, publicTransport } = req.body;
    properties.push({ email, address, neighborhood, squareFootage, garage, publicTransport, workspaces: [] });
    res.json({ success: true, message: 'Property added!' });
});

app.get('/properties', (req, res) => {
    const { email } = req.query;
    const userProperties = properties.filter(p => p.email === email);
    res.json({ success: true, properties: userProperties });
});

app.delete('/properties/:index', (req, res) => {
    const { email } = req.body;
    const index = parseInt(req.params.index);
    const userProperties = properties.filter(p => p.email === email);
    if (index >= 0 && index < userProperties.length) {
        const globalIndex = properties.indexOf(userProperties[index]);
        properties.splice(globalIndex, 1);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Property not found' });
    }
});

app.post('/workspaces', (req, res) => {
    const { email, propertyIndex, type, capacity, smoking, availability, leaseTerm, price } = req.body;
    const userProperties = properties.filter(p => p.email === email);
    if (propertyIndex >= 0 && propertyIndex < userProperties.length) {
        userProperties[propertyIndex].workspaces.push({ type, capacity, smoking, availability, leaseTerm, price, ownerEmail: email });
        res.json({ success: true, message: 'Workspace added!' });
    } else {
        res.json({ success: false, message: 'Property not found' });
    }
});

app.put('/workspaces/:propertyIndex/:workspaceIndex', (req, res) => {
    const { email, type, capacity, smoking, availability, leaseTerm, price } = req.body;
    const propertyIndex = Number(req.params.propertyIndex);
    const workspaceIndex = Number(req.params.workspaceIndex);

    if (!Number.isInteger(propertyIndex) || !Number.isInteger(workspaceIndex) || propertyIndex < 0 || workspaceIndex < 0) {
        return res.json({ success: false, message: 'Invalid workspace selection.' });
    }

    const property = properties[propertyIndex];
    if (!property || property.email !== email) {
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
        ownerEmail: email
    };

    res.json({ success: true, message: 'Workspace updated!' });
});

app.delete('/workspaces/:propertyIndex/:workspaceIndex', (req, res) => {
    const { email } = req.body;
    const propertyIndex = Number(req.params.propertyIndex);
    const workspaceIndex = Number(req.params.workspaceIndex);

    if (!Number.isInteger(propertyIndex) || !Number.isInteger(workspaceIndex) || propertyIndex < 0 || workspaceIndex < 0) {
        return res.json({ success: false, message: 'Invalid workspace selection.' });
    }

    const property = properties[propertyIndex];
    if (!property || property.email !== email) {
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

app.listen(3000, () => {
    console.log('Server running on port 3000');
});