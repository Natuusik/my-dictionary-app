// Подключение к РЕАЛЬНОМУ облаку Supabase со всеми вашими оригинальными ключами
const REAL_SUPABASE_URL = 'https://pectfpuacdbkompcwyfm.supabase.co'; 
const REAL_SUPABASE_KEY = 'sb_publishable_v4DIxL6UfhihcNOZkq-Bag_8OrXAF_D'; 

// Если библиотека из CDN (в HTML) загрузилась, создаем настоящий облачный мост
if (window.supabase && window.supabase.createClient) {
    // Инициализируем клиент, который будут использовать все наши скрипты
    window.supabaseClient = window.supabase.createClient(REAL_SUPABASE_URL, REAL_SUPABASE_KEY);
    console.log("☁️ Облачный клиент Supabase успешно инициализирован с полным ключом!");
} else {
    console.error("Ошибка: Библиотека Supabase CDN не найдена. Проверьте теги в index.html");
}
