require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Секретный ключ для шифрования токенов пользователей
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_dictionary_123";

// НАДЁЖНОЕ ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ
// Этот код сам разберётся, нужен ли SSL на компьютере и на Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com') 
    ? { rejectUnauthorized: false } 
    : false
});

app.use(express.json());

// ВАЖНО: Разрешаем серверу отдавать файлы ПРЯМО ИЗ КОРНЯ проекта
app.use(express.static(path.join(__dirname)));

// Создаем папку для аудио прямо в корне (если её нет)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'voice-' + uniqueSuffix + '.wav');
    }
});
const upload = multer({ storage: storage });

// Инициализация базы данных: создаем изолированные таблицы для вашего приложения
async function initDB() {
    try {
        // Таблица пользователей
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dict_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            );
        `);
        // Таблица данных словаря (храним JSON-структуру appData индивидуально для каждого пользователя)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dict_userdata (
                user_id INTEGER PRIMARY KEY REFERENCES dict_users(id) ON DELETE CASCADE,
                data JSONB NOT NULL
            );
        `);
        console.log("База данных PostgreSQL успешно подключена! Таблицы dict_ созданы.");
    } catch (err) {
        console.error("Ошибка при инициализации базы данных:", err);
    }
}
initDB();

// МИДЛВАР ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ (Проверяет паспорт/токен пользователя)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Достаем "TOKEN" из строки "Bearer TOKEN"

    if (!token) return res.status(401).json({ error: "Вход не выполнен. Залогиньтесь." });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Сессия истекла, войдите заново." });
        req.userId = decoded.userId; // Запоминаем ID залогиненного пользователя
        next();
    });
}

// ==========================================
// БЛОК 1: РЕГИСТРАЦИЯ И ВХОД
// ==========================================

// API: Регистрация нового аккаунта
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Заполните все поля" });

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        
        // Добавляем пользователя
        const userResult = await pool.query(
            'INSERT INTO dict_users (username, password_hash) VALUES ($1, $2) RETURNING id',
            [username, passwordHash]
        );
        const newUserId = userResult.rows[0].id;

        // Создаем ему пустой начальный словарь по умолчанию
        const defaultData = { en: [], et: [] };
        await pool.query(
            'INSERT INTO dict_userdata (user_id, data) VALUES ($1, $2)',
            [newUserId, JSON.stringify(defaultData)]
        );

        res.status(201).json({ success: true, message: "Аккаунт успешно создан!" });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: "Этот логин уже занят" });
        console.error(err);
        res.status(500).json({ error: "Ошибка при регистрации" });
    }
});

// API: Вход в аккаунт
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM dict_users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(400).json({ error: "Пользователь не найден" });

        const user = result.rows[0];
        const isPasswordCorrect = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordCorrect) return res.status(400).json({ error: "Неверный пароль" });

        // Создаем JWT-токен на 30 дней
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

        res.json({ success: true, token, username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка при входе" });
    }
});

// ==========================================
// БЛОК 2: РАБОТА СО СЛОВАРЕМ ПОЛЬЗОВАТЕЛЯ (ЗАЩИЩЕННЫЕ)
// ==========================================

// API: Получить данные словаря ТОЛЬКО ТЕКУЩЕГО пользователя
app.get('/api/data', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT data FROM dict_userdata WHERE user_id = $1', [req.userId]);
        if (result.rows.length === 0) {
            return res.json({ en: [], et: [] });
        }
        res.json(result.rows[0].data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Не удалось загрузить данные" });
    }
});

// API: Сохранить измененные папки и слова ТОЛЬКО ТЕКУЩЕМУ пользователю
app.post('/api/data', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE dict_userdata SET data = $1 WHERE user_id = $2',
            [JSON.stringify(req.body), req.userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Не удалось сохранить данные" });
    }
});

// API: Загрузка аудиофайла
app.post('/api/upload-audio', authenticateToken, upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    // Файл теперь берется напрямую из /uploads/
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, audioUrl: fileUrl });
});

// СЕКРЕТНЫЙ РОУТ ДЛЯ СБРОСА ПАРОЛЯ (Знаете только вы)
// Чтобы сбросить пароль, нужно отправить POST запрос на http://xn----7sbbf2b7bj7b.com
// с JSON-телом: { "username": "логин_пользователя", "newPassword": "новый_пароль", "secretAdminKey": "придумайте_секретный_ключ" }
app.post('/api/admin/reset-password', async (req, res) => {
    const { username, newPassword, secretAdminKey } = req.body;

    // Защита: проверяем ваш личный секретный ключ, чтобы обычные пользователи не ломали чужие аккаунты
    const MY_SECRET_ADMIN_KEY = "my_super_safe_admin_key_777"; // Срочно поменяйте на своё секретное слово!

    if (secretAdminKey !== MY_SECRET_ADMIN_KEY) {
        return res.status(403).json({ error: "Доступ запрещен! Неверный админ-ключ." });
    }

    if (!username || !newPassword) {
        return res.status(400).json({ error: "Укажите имя пользователя и новый пароль" });
    }

    try {
        // Хешируем новый пароль
        const newHash = await bcrypt.hash(newPassword, 10);
        
        // Обновляем пароль в базе данных
        const result = await pool.query(
            'UPDATE dict_users SET password_hash = $1 WHERE username = $2 RETURNING id',
            [newHash, username]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Пользователь с таким логином не найден" });
        }

        res.json({ success: true, message: `Пароль для пользователя ${username} успешно изменен!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка сервера при сбросе пароля" });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
