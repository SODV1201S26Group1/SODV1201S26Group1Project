const express = require('express');
const app = express();

const users = [];

app.use(express.json());
app.use(express.static('public'));

app.post('/register', (req, res) => {
  const {name, phone, email, password, role } = req.body;
  users.push({ name, phone, email, password,role });
  res.json({ success: true, message: 'User registered!' });
});

   app.listen(3000, () => {
   console.log('Server running on port 3000');
    });
