require('dotenv').config();
const express = require('express');
const path    = require('path');
const mantelzorgRoutes = require('./routes/mantelzorg');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js',  express.static(path.join(__dirname, 'js')));

app.use('/api/mantelzorg', mantelzorgRoutes);
app.get('/mantelzorg-loket', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mantelzorg-loket.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mantelzorg-loket.html'));
});
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'mantelzorg-loket.html'));
});

app.listen(PORT, () => console.log(`Mantelzorgmaatje draait op http://localhost:${PORT}`));
