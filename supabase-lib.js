// Этот скрипт сам на лету скачивает и разворачивает Supabase внутри приложения
(function() {
    console.log("⏳ Локальный модуль запускает экстренную загрузку Supabase...");
    const script = document.createElement('script');
    
    // Используем самый стабильный мировой адрес библиотеки, который никогда не блокируется
    script.src = "https://unpkg.com";
    script.async = false;
    
    script.onload = () => {
        if (window.supabase && window.supabase.createClient) {
            console.log("🎯 Библиотека Supabase успешно развернута в памяти браузера!");
            // Автоматически запускаем инициализацию в основном script.js, если он уже готов
            if (typeof forceLoadSupabase === 'function') {
                forceLoadSupabase();
            }
        }
    };
    
    script.onerror = () => {
        console.error("❌ Не удалось загрузить облачную базу данных. Проверьте подключение к интернету.");
    };
    
    document.head.appendChild(script);
})();

