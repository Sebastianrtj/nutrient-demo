import { createApp } from './app.js';
const port = Number(process.env.PORT || 8769);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number');
createApp().listen(port, '127.0.0.1', () => console.log(`Ridgeline demo server listening at http://127.0.0.1:${port}`));
