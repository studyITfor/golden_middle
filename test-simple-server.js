const express = require('express');
const app = express();

app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(3000, () => {
    console.log('Simple server running on port 3000');
});
