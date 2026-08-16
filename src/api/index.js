const express = require('express');
const app = express();

// Middleware para parsear JSON
app.use(express.json());

// Base de datos simulada en memoria
let items = [
    { id: 1, nombre: 'Item inicial' }
];

// ==========================================
// 1. HEALTH CHECK
// ==========================================
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// ==========================================
// 2. CRUD DE ITEMS
// ==========================================

// GET: Obtener todos los items
app.get('/items', (req, res) => {
    res.json(items);
});

// GET: Obtener un item por ID
app.get('/items/:id', (req, res) => {
    const item = items.find(i => i.id === parseInt(req.params.id));
    if (!item) return res.status(404).json({ message: 'Item no encontrado' });
    res.json(item);
});

// POST: Crear un nuevo item (con excepción)
app.post('/items', (req, res, next) => {
    try {
        const { nombre, forzarError } = req.body;

        // Lanzar excepción intencional si no hay nombre o si se envía la bandera 'forzarError'
        if (!nombre || forzarError) {
            throw new Error('Excepción intencional: Faltan datos o se forzó el error en el ADD');
        }

        const nuevoItem = {
            id: items.length ? items[items.length - 1].id + 1 : 1,
            nombre
        };
        items.push(nuevoItem);
        res.status(201).json(nuevoItem);
    } catch (error) {
        // Enviar el error al middleware de manejo de excepciones
        next(error); 
    }
});

// PUT: Actualizar un item (con excepción)
app.put('/items/:id', (req, res, next) => {
    try {
        const { nombre, forzarError } = req.body;

        // Lanzar excepción intencional
        if (!nombre || forzarError) {
            throw new Error('Excepción intencional: Faltan datos o se forzó el error en el UPDATE');
        }

        const index = items.findIndex(i => i.id === parseInt(req.params.id));
        if (index === -1) return res.status(404).json({ message: 'Item no encontrado' });

        items[index].nombre = nombre;
        res.json(items[index]);
    } catch (error) {
        next(error);
    }
});

// DELETE: Eliminar un item
app.delete('/items/:id', (req, res) => {
    items = items.filter(i => i.id !== parseInt(req.params.id));
    res.status(204).send(); // 204 No Content
});

// ==========================================
// 3. MIDDLEWARE DE MANEJO DE ERRORES
// ==========================================
app.use((err, req, res, next) => {
    console.error(`[Error detectado]: ${err.message}`);
    res.status(500).json({
        error: true,
        mensaje: err.message
    });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API corriendo en http://localhost:${PORT}`);
});