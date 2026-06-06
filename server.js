const express = require('express');
const app = express();

const users = [];

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

app.listen(3000, () => {
    console.log('Server running on port 3000');
});