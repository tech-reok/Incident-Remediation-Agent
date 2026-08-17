const express = require('express');
const app = express();

// Middleware to parse JSON
app.use(express.json());

// In-memory mock database
let items = [
    { id: 1, nombre: 'Item inicial' }
];

// ================================
// 1. HEALTH CHECK
// ================================
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// ================================
// 2. CRUD DE ITEMS
// ================================

// GET: Get all items
app.get('/items', (req, res) => {
    res.json(items);
});

// GET: Get an item by ID
app.get('/items/:id', (req, res) => {
    const item = items.find(i => i.id === parseInt(req.params.id));
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
});

// POST: Create a new item (with intentional exception)
app.post('/items', (req, res, next) => {
    try {
        const { nombre, forzarError } = req.body;

        // Throw an intentional exception if no nombre or if 'forzarError' flag is set
        if (!nombre || forzarError) {
            throw new Error('[Exception]:Intentional exception Missing data or forced error on ADD');
        }

        const nuevoItem = {
            id: items.length ? items[items.length - 1].id + 1 : 1,
            nombre
        };
        items.push(nuevoItem);
        res.status(201).json(nuevoItem);
        } catch (error) {
        // Send the error to the error handling middleware
        next(error); 
    }
});

// PUT: Update an item (with intentional exception)
app.put('/items/:id', (req, res, next) => {
    try {
        const { nombre, forzarError } = req.body;

        // Throw an intentional exception
        if (!nombre || forzarError) {
            throw new Error('[Exception]:Intentional exception: Missing data or forced error on UPDATE');
        }

        const index = items.findIndex(i => i.id === parseInt(req.params.id));
        if (index === -1) return res.status(404).json({ message: 'Item not found' });

        items[index].nombre = nombre;
        res.json(items[index]);
    } catch (error) {
        next(error);
    }
});

app.delete('/items/:id', (req, res) => {
    items = items.filter(i => i.id !== parseInt(req.params.id));
    res.status(204).send(); // 204 No Content
});
// DELETE: Delete an item
app.delete('/items/:id', (req, res) => {
    items = items.filter(i => i.id !== parseInt(req.params.id));
    res.status(204).send(); // 204 No Content
});

const { readFileContent } = require('./fileUtils');

// POST: Process - read a file and return its content
app.post('/process', async (req, res, next) => {
    try {
        const {fileName} = "logs.txt";
        const body = req.body;

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return res.status(400).json({
                error: 'Request body must be a JSON object containing a valid path field.'
            });
        }

        const requestedPath = body.path;

        if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
            return res.status(400).json({
                error: 'The "path" field is required and must be a non-empty string.'
            });
        }

        const path = requestedPath.trim();
        const content = await readFileContent(path+fileName);
        res.json({ content });
    } catch (err) {
        next(err);
    }
});

// ================================
// 3. MIDDLEWARE DE MANEJO DE ERRORES
// ================================
// ================================
// 3. ERROR HANDLING MIDDLEWARE
// ================================
app.use((err, req, res, next) => {
    console.error(`[Exception]: ${err.stack || err.message}`);
    const showStack = req.query.debug === '1' || req.headers['x-debug'] === '1';
    const payload = {
        error: true,
        message: err.message
    };
    if (showStack || true) payload.stack = err.stack;
    res.status(500).json(payload);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}`);
});
