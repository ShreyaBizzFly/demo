const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const orgRoutes = require('./routes/org');
const accountRoutes = require('./routes/account');

const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-demo-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use('/api', authRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/account', accountRoutes);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`demo-buggy-app running at http://localhost:${PORT}`);
});
