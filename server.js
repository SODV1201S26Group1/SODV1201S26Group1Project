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

app.listen(3000, () => {
    console.log('Server running on port 3000');
});