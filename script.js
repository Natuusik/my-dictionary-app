// ========================================================
// 1. ИНИЦИАЛИЗАЦИЯ ДАННЫХ И ХРАНИЛИЩА (БАЗА ДАННЫХ + AUTH)
// ========================================================

let currentLanguage = 'en'; // Выбранный язык по умолчанию ('en' или 'et')
let activeTopicId = null;    // ID открытой в данный момент папки
let availableVoices = [];    // Список доступных роботов озвучки

// Базовая структура
let appData = { en: [], et: [] };

// Системные переменные для работы диктофона и аудио-тренажёра
let mediaRecorder = null;
let audioChunks = [];
let recordingWordId = null;
let wordTimeout = null;
let countdownInterval = null;
let isTraining = false;

// ФУНКЦИЯ СОХРАНЕНИЯ: Отправляет данные на сервер в PostgreSQL
async function saveData() {
    const token = localStorage.getItem('userToken');
    if (!token) return; // Если пользователь не вошел, ничего не делаем

    localStorage.setItem('my_dictionary_current_lang', currentLanguage);

    try {
        const response = await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // Передаем токен для авторизации
            },
            body: JSON.stringify(appData)
        });
        
        const result = await response.json();
        if (!response.ok) console.error("Ошибка сохранения:", result.error);
    } catch (e) {
        console.error("Ошибка сети при сохранении данных:", e);
    }
}

// ФУНКЦИЯ ЗАГРУЗКИ: Достает данные из базы данных при старте страницы
async function loadData() {
    const token = localStorage.getItem('userToken');
    const username = localStorage.getItem('username');

    // Проверяем, вошел ли пользователь вообще
    if (!token) {
        document.getElementById('authScreen').style.display = 'block';
        document.getElementById('mainScreen').style.display = 'none';
        return;
    }

    // Если токен есть, показываем приложение и скрываем окно входа
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = 'block';
    document.getElementById('userInfoText').innerText = `👤 Аккаунт: ${username}`;

    // Восстанавливаем последний выбранный язык из локальной памяти
    const savedLang = localStorage.getItem('my_dictionary_current_lang');
    if (savedLang) currentLanguage = savedLang;

    try {
        const response = await fetch('/api/data', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401 || response.status === 403) {
            // Если токен протух или неверный, разлогиниваем пользователя
            handleLogout();
            return;
        }

        const data = await response.json();
        appData = data;
        
        // После успешной загрузки данных запускаем отрисовку папок на экране
        // Важно: убедитесь, что функция renderTopics() у вас объявлена далее по коду!
        if (typeof renderTopics === 'function') {
            renderTopics(); 
        }
    } catch (e) {
        console.error("Ошибка сети при загрузке данных:", e);
    }
}

// ========================================================
// НОВЫЙ БЛОК: ФУНКЦИИ АВТОРИЗАЦИИ (ВХОД / РЕГИСТРАЦИЯ / ВЫХОД)
// ========================================================

// Обработка кнопок "Войти" и "Регистрация"
async function handleAuth(type) {
    const usernameInput = document.getElementById('authUsername').value.trim();
    const passwordInput = document.getElementById('authPassword').value.trim();
    const msgElement = document.getElementById('authMessage');

    if (!usernameInput || !passwordInput) {
        msgElement.style.color = 'red';
        msgElement.innerText = "⚠️ Заполните все поля!";
        return;
    }

    const url = type === 'login' ? '/api/login' : '/api/register';
    msgElement.style.color = '#3b82f6';
    msgElement.innerText = type === 'login' ? "Вход..." : "Регистрация аккаунта...";

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });

        const result = await response.json();

        if (!response.ok) {
            msgElement.style.color = 'red';
            msgElement.innerText = `❌ ${result.error || 'Ошибка'}`;
            return;
        }

        if (type === 'register') {
            msgElement.style.color = 'green';
            msgElement.innerText = "✅ Регистрация успешна! Теперь нажмите 'Войти'";
        } else {
            // Сохраняем токен в память браузера
            localStorage.setItem('userToken', result.token);
            localStorage.setItem('username', result.username);
            
            // Очищаем форму и загружаем данные словаря
            document.getElementById('authUsername').value = '';
            document.getElementById('authPassword').value = '';
            msgElement.innerText = '';
            
            loadData();
        }
    } catch (e) {
        msgElement.style.color = 'red';
        msgElement.innerText = "❌ Ошибка соединения с сервером";
    }
}

// Выход из аккаунта
function handleLogout() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('username');
    document.getElementById('authScreen').style.display = 'block';
    document.getElementById('mainScreen').style.display = 'none';
    document.getElementById('authMessage').style.color = 'black';
    document.getElementById('authMessage').innerText = "Вы успешно вышли из аккаунта.";
}

// ========================================================
// 2. УПРАВЛЕНИЕ ЯЗЫКАМИ И ПАПКАМИ (ТЕМAМИ)
// ========================================================

// ФУНКЦИЯ: Переключение между Английской и Эстонской полками
async function switchLanguage(lang) {
    currentLanguage = lang;
    activeTopicId = null; // При смене языка ОБЯЗАТЕЛЬНО закрываем открытую папку другого языка
    
    // Подсвечиваем нужную кнопку-вкладку в HTML
    const tabEn = document.getElementById('tab-en');
    const tabEt = document.getElementById('tab-et');
    if (tabEn) tabEn.classList.toggle('active', lang === 'en');
    if (tabEt) tabEt.classList.toggle('active', lang === 'et');
    
    // Полностью прячем блок со словами, так как папка закрылась
    const contentBlock = document.getElementById('folderContentBlock');
    if (contentBlock) contentBlock.style.display = 'none';
    
    await saveData();     // Сохраняем информацию о текущем языке на сервер
    renderTopics(); // Рисуем папки только для выбранного языка
}

// ФУНКЦИЯ: Отрисовка папок выбранного языка на экране
function renderTopics() {
    const container = document.getElementById('topicsContainer');
    if (!container) return;
    container.innerHTML = '';

    // Берем папки строго текущего языка (en или et)
    const currentTopics = appData[currentLanguage] || [];

    if (currentTopics.length === 0) {
        container.innerHTML = '<p style="color:#64748b; font-size:14px; grid-column:span 3;">Папок пока нет. Создай первую тему выше!</p>';
        return;
    }

    currentTopics.forEach(topic => {
        const folder = document.createElement('div');
        // Подсвечиваем папку, если она открыта прямо сейчас
        folder.className = `topic-folder ${activeTopicId === topic.id ? 'active' : ''}`;
        
        folder.onclick = (e) => {
            if (e.target.classList.contains('btn-delete-folder')) return;
            openTopic(topic.id);
        };

        folder.innerHTML = `
            <button class="btn-delete-folder" onclick="deleteTopic(${topic.id})">❌</button>
            <span class="folder-icon">📁</span>
            <span class="folder-name">${topic.name}</span>
        `;
        container.appendChild(folder);
    });
}

// ФУНКЦИЯ: Создание новой папки
async function createTopic() {
    const input = document.getElementById('newTopicInput');
    if (!input) return;
    
    const name = input.value.trim();
    if (!name) { alert("Введи название папки!"); return; }

    const newTopic = {
        id: Date.now(), // Создаем уникальный ID папки
        name: name,
        words: []
    };

    // Проверяем существование массива на случай, если структура пустая
    if (!appData[currentLanguage]) appData[currentLanguage] = [];
    
    // Добавляем папку в массив текущего языка
    appData[currentLanguage].push(newTopic);
    input.value = ''; // Очищаем поле ввода
    
    await saveData();     // Сохраняем на сервер в PostgreSQL
    renderTopics(); // Перерисовываем папки на экране
}

// ФУНКЦИЯ: Удаление папки
async function deleteTopic(id) {
    if (!confirm("Удалить эту папку и все слова внутри неё?")) return;

    appData[currentLanguage] = appData[currentLanguage].filter(t => t.id !== id);
    
    if (activeTopicId === id) {
        activeTopicId = null;
        const contentBlock = document.getElementById('folderContentBlock');
        if (contentBlock) contentBlock.style.display = 'none';
    }

    await saveData(); // Сохраняем изменения на сервер!
    renderTopics();
}

// ФУНКЦИЯ: Переименование папки
async function renameActiveTopic() {
    const currentTopics = appData[currentLanguage] || [];
    const topic = currentTopics.find(t => t.id === activeTopicId);
    if (!topic) return;

    const newName = prompt("Введи новое название для этой папки:", topic.name);
    if (newName && newName.trim() !== "") {
        topic.name = newName.trim();
        const activeFolderNameElem = document.getElementById('activeFolderName');
        if (activeFolderNameElem) activeFolderNameElem.innerText = topic.name;
        
        await saveData(); // Сохраняем изменения на сервер!
        renderTopics(); 
    }
}

// ТОЧКА СТАРТА ПРИЛОЖЕНИЯ: Запускается сама сразу при обновлении страницы
async function initApp() {
    // ВАЖНО: Ждем, пока загрузятся данные из базы данных на сервере
    await loadData(); 
    
    // Подсвечиваем ту вкладку языка, которая была выбрана до перезагрузки
    const tabEn = document.getElementById('tab-en');
    const tabEt = document.getElementById('tab-et');
    if (tabEn) tabEn.classList.toggle('active', currentLanguage === 'en');
    if (tabEt) tabEt.classList.toggle('active', currentLanguage === 'et');
}

// Передаем управление функции автозапуска
initApp();

// ========================================================
// 3. РАБОТА СО СЛОВАМИ И ЗАПИСЬ ГОЛОСА (BASE64)
// ========================================================

// ФУНКЦИЯ: Открытие конкретной папки
function openTopic(id) {
    activeTopicId = id;
    const topic = appData[currentLanguage].find(t => t.id === id);
    if (!topic) return;

    const activeFolderNameElem = document.getElementById('activeFolderName');
    const contentBlock = document.getElementById('folderContentBlock');
    
    if (activeFolderNameElem) activeFolderNameElem.innerText = topic.name;
    if (contentBlock) contentBlock.style.display = 'block';
    
    renderTopics(); // Перерисовываем, чтобы выбранная папка выделилась цветом
    renderWords();  // Рисуем её слова
}

// ФУНКЦИЯ: Отрисовка списка слов
function renderWords() {
    const container = document.getElementById('wordsContainer');
    if (!container) return;
    container.innerHTML = '';

    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    if (!topic || topic.words.length === 0) {
        container.innerHTML = '<p style="color:#64748b; font-size:14px; padding:10px 0;">В этой папке пока пусто. Добавь слова ниже!</p>';
        return;
    }

    topic.words.forEach(w => {
        const item = document.createElement('div');
        item.className = 'word-item';
        
        // Текст кнопки меняется, если у этого слова сохранен Base64 звук
        const hasVoice = w.customAudio ? '🔊 Послушать' : '🎙 Записать';

        item.innerHTML = `
            <div style="text-align: left;">
                <strong>${w.foreign}</strong> — <span style="color:#64748b;">${w.russian}</span>
            </div>
            <div class="word-actions">
                <button class="btn-mic" id="mic-btn-${w.id}" onclick="handleVoiceAction(${w.id})">${hasVoice}</button>
                <button class="btn-delete-word" onclick="deleteWord(${w.id})">🗑️</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// ФУНКЦИЯ: Добавление нового слова в тему
async function addWordToTopic() {
    // Проверяем все варианты ID, которые могли остаться в HTML
    const foreignInput = document.getElementById('foreignWordInput') || 
                         document.getElementById('foreignWordInputNew') ||
                         document.getElementById('foreignWordInputHint');
                         
    const russianInput = document.getElementById('russianWordInput') || 
                         document.getElementById('russianWordInputNew');

    if (!foreignInput || !russianInput) {
        console.error("Критическая ошибка: Браузер не смог найти поля ввода на странице HTML!");
        alert("Ошибка интерфейса: Поля ввода не найдены. Проверь ID в index.html");
        return;
    }
    
    const foreignText = foreignInput.value.trim();
    const russianText = russianInput.value.trim();

    if (!foreignText || !russianText) {
        alert("Заполни оба поля: и слово, и его перевод!");
        return;
    }

    // Проверяем, открыта ли папка
    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    
    if (!topic) {
        alert("Сначала выбери и открой какую-нибудь папку (кликни по ней)!");
        return;
    }

    // Добавляем слово в массив папки
    topic.words.push({
        id: Date.now(),
        foreign: foreignText,
        russian: russianText,
        customAudio: null
    });

    // Очищаем текстовые поля на экране
    foreignInput.value = '';
    russianInput.value = '';
    
    // Если в HTML остался блок предложений Т9, очищаем и его
    const suggestionBlock = document.getElementById('offlineSuggestionBlock') || 
                            document.getElementById('spellCheckSuggestion');
    if (suggestionBlock) suggestionBlock.innerHTML = '';

    await saveData();     // ИСПРАВЛЕНО: Сохраняем на сервер в базу PostgreSQL!
    renderWords();  // Мгновенно выводим новое слово снизу на экран!
    console.log("Слово успешно добавлено:", foreignText);
}

// ФУНКЦИЯ: Удаление одного слова
async function deleteWord(wordId) {
    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    if (topic) {
        topic.words = topic.words.filter(w => w.id !== wordId);
        await saveData(); // ИСПРАВЛЕНО: Сохраняем изменения на сервер!
        renderWords();
    }
}

// ФУНКЦИЯ УПРАВЛЕНИЯ ГОЛОСОМ: Воспроизводит или включает запись
function handleVoiceAction(wordId) {
    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    const word = topic ? topic.words.find(w => w.id === wordId) : null;
    
    if (word && word.customAudio) {
        const audio = new Audio(word.customAudio);
        audio.play();
    } else {
        toggleRecord(wordId);
    }
}

// ФУНКЦИЯ ЗАПИСИ ГОЛОСА
async function toggleRecord(wordId) {
    // Безопасность: не разрешаем записывать звук без токена авторизации
    if (!localStorage.getItem('userToken')) {
        alert("Пожалуйста, войдите в свой аккаунт, чтобы записывать аудио!");
        return;
    }

    const btn = document.getElementById(`mic-btn-${wordId}`);
    if (!btn) return;
    
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        recordingWordId = wordId;
        audioChunks = [];
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async function() {
                    const base64Audio = reader.result;
                    
                    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
                    const word = topic ? topic.words.find(w => w.id === recordingWordId) : null;
                    
                    if (word) {
                        word.customAudio = base64Audio; 
                        await saveData(); // ИСПРАВЛЕНО: Дожидаемся успешной отправки аудио на сервер                 
                        renderWords();                 
                    }
                }
            };
            
            mediaRecorder.start();
            btn.innerText = "🛑 Стоп";
            btn.style.background = "#ef4444";
        } catch (err) {
            console.error("Не удалось получить доступ к микрофону:", err);
            alert("Ошибка доступа к микрофону. Убедитесь, что дали разрешение сайту.");
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

// ========================================================
// 4.1. ПОДГОТОВКА РОБОТОВ ОЗВУЧКИ
// ========================================================

// ФУНКЦИЯ: Загрузка списка доступных голосов из операционной системы + Резервные варианты
function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') return;

    availableVoices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voiceSelectNew'); 
    if (!voiceSelect) return;

    voiceSelect.innerHTML = '';

    // Вариант А: Если браузер честно отдал системные голоса
    if (availableVoices.length > 0) {
        const filteredVoices = availableVoices.filter(voice => {
            const lang = voice.lang.toLowerCase();
            return lang.startsWith('en') || lang.startsWith('et') || lang.startsWith('ru');
        });

        const voicesToDisplay = filteredVoices.length > 0 ? filteredVoices : availableVoices;

        voicesToDisplay.forEach((voice) => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.value = availableVoices.indexOf(voice); 
            
            if (voice.lang.startsWith('ru-RU') || voice.lang.startsWith('ru_RU')) {
                option.selected = true;
            }
            voiceSelect.appendChild(option);
        });
        return; 
    }

    // Вариант Б: Резервный список, если браузер заблокировал загрузку локально
    const fakeVoices = [
        { name: "🇷🇺 Робот Ирина (Стандартный русский)", lang: "ru-RU", id: "fake-ru" },
        { name: "🇬🇧 Робот Джон (Стандартный английский)", lang: "en-US", id: "fake-en" },
        { name: "🇪🇪 Робот Март (Стандартный эстонский)", lang: "et-EE", id: "fake-et" }
    ];

    fakeVoices.forEach(fake => {
        const option = document.createElement('option');
        option.textContent = fake.name;
        option.value = fake.id; 
        if (fake.lang === "ru-RU") option.selected = true;
        voiceSelect.appendChild(option);
    });
}

// Запускаем таймер проверки: опрашиваем систему, пока голоса не станут доступны
let voiceCheckInterval = setInterval(() => {
    if (typeof speechSynthesis !== 'undefined') {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            populateVoiceList();
            clearInterval(voiceCheckInterval);
        }
    }
}, 300);

if (typeof speechSynthesis !== 'undefined' && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
        populateVoiceList();
        clearInterval(voiceCheckInterval);
    };
}
setTimeout(populateVoiceList, 500);


// ========================================================
// 4.2. ВКЛЮЧЕНИЕ И ВЫКЛЮЧЕНИЕ ТРЕНАЖЁРА (ЭКРАНЫ)
// ========================================================

// Главный рубильник кнопки тренажёра
function toggleTraining() {
    if (isTraining) {
        stopTraining();
    } else {
        startTraining();
    }
}

// ФУНКЦИЯ: Старт тренировки и переключение экрана
function startTraining() {
    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    
    if (!topic || topic.words.length === 0) {
        alert("В этой папке нет слов для тренировки! Сначала добавь слова.");
        return;
    }

    isTraining = true;
    
    // Прячем главный экран (Экран 1) и показываем экран тренажёра (Экран 2)
    const mainScreen = document.getElementById('mainScreen');
    const trainerScreen = document.getElementById('trainerScreen');
    if (mainScreen) mainScreen.style.display = 'none';
    if (trainerScreen) trainerScreen.style.display = 'block';

    // Очищаем старые надписи перед началом
    if (document.getElementById('wordDisplay')) document.getElementById('wordDisplay').innerText = "Приготовься...";
    if (document.getElementById('translationDisplay')) document.getElementById('translationDisplay').innerText = "";
    if (document.getElementById('audioTypeDisplay')) document.getElementById('audioTypeDisplay').innerText = "";

    nextTrainingStep(); // Запускаем первое случайное слово
}

// ФУНКЦИЯ: Остановка тренажёра и возврат домой
function stopTraining() {
    isTraining = false;
    
    clearTimeout(wordTimeout);
    clearInterval(countdownInterval);
    
    // Глушим робота, если он говорил в момент нажатия кнопки
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    
    // Возвращаем главный экран и прячем тренировочный
    const mainScreen = document.getElementById('mainScreen');
    const trainerScreen = document.getElementById('trainerScreen');
    if (mainScreen) mainScreen.style.display = 'block';
    if (trainerScreen) trainerScreen.style.display = 'none';
}

// ========================================================
// 4.3. ЛОГИКА ОДНОГО ШАГА ТРЕНАЖЁРА
// ========================================================

function nextTrainingStep() {
    if (!isTraining) return;

    const topic = appData[currentLanguage].find(t => t.id === activeTopicId);
    if (!topic || topic.words.length === 0) { stopTraining(); return; }

    const randomIndex = Math.floor(Math.random() * topic.words.length);
    const randomWord = topic.words[randomIndex];

    const wordDisplay = document.getElementById('wordDisplay');
    const translationDisplay = document.getElementById('translationDisplay');
    const audioTypeDisplay = document.getElementById('audioTypeDisplay');
    const timerDisplay = document.getElementById('timerDisplay');

    // Считываем ползунки и режим направления перевода с экрана
    const speedInput = document.getElementById('speedRangeNew');
    const pauseInput = document.getElementById('pauseRangeNew');
    const modeSelect = document.getElementById('modeSelectNew');
    const voiceSelect = document.getElementById('voiceSelectNew');
    
    const currentSpeed = speedInput ? parseFloat(speedInput.value) : 1.0;
    const userPauseSeconds = pauseInput ? parseInt(pauseInput.value) : 3;
    const currentMode = modeSelect ? modeSelect.value : 'foreign-ru';

    if (translationDisplay) translationDisplay.innerText = "";

    // Настраиваем, какой язык звучит первым, а какой вторым
    let firstSpeechText = "";
    let firstSpeechLang = "";
    let secondSpeechText = "";
    let secondSpeechLang = "";
    let isCustomAudioAvailable = false;

    if (currentMode === 'foreign-ru') {
        firstSpeechText = randomWord.foreign;
        firstSpeechLang = currentLanguage === 'en' ? 'en-US' : 'et-EE';
        secondSpeechText = randomWord.russian;
        secondSpeechLang = 'ru-RU';
        if (randomWord.customAudio) isCustomAudioAvailable = true;
    } else {
        firstSpeechText = randomWord.russian;
        firstSpeechLang = 'ru-RU';
        secondSpeechText = randomWord.foreign;
        secondSpeechLang = currentLanguage === 'en' ? 'en-US' : 'et-EE';
        if (randomWord.customAudio) isCustomAudioAvailable = false; 
    }

    if (wordDisplay) wordDisplay.innerText = firstSpeechText;

    // Выясняем, какой голос выбран пользователем
    let selectedVoice = null;
    let forceLang = firstSpeechLang;

    if (voiceSelect && voiceSelect.value !== 'default') {
        const val = voiceSelect.value;
        if (val.startsWith('fake-')) {
            if (val === 'fake-ru') forceLang = 'ru-RU';
            if (val === 'fake-en') forceLang = 'en-US';
            if (val === 'fake-et') forceLang = 'et-EE';
        } else if (availableVoices.length > 0) {
            selectedVoice = availableVoices[parseInt(val)];
        }
    }

    // === ЭТАП 1: Произношение первого слова ===
    if (currentMode === 'foreign-ru' && isCustomAudioAvailable) {
        if (audioTypeDisplay) audioTypeDisplay.innerText = "🎤 Звучит твой голос";
        const audio = new Audio(randomWord.customAudio);
        audio.playbackRate = currentSpeed; // Меняем скорость твоего голоса
        audio.play();
    } else {
        if (audioTypeDisplay) audioTypeDisplay.innerText = "🤖 Озвучка роботом";
        const utterance = new SpeechSynthesisUtterance(firstSpeechText);
        utterance.rate = currentSpeed; // Меняем скорость робота
        
        if (selectedVoice && !voiceSelect.value.startsWith('fake-')) {
            if (selectedVoice.lang.toLowerCase().startsWith(firstSpeechLang.substring(0, 2))) {
                utterance.voice = selectedVoice;
            } else {
                utterance.lang = firstSpeechLang;
            }
        } else {
            utterance.lang = forceLang; 
        }
        window.speechSynthesis.speak(utterance);
    }

    // === ЭТАП 2: Включение обратного отсчета секунд ===
    let secondsLeft = userPauseSeconds;
    if (timerDisplay) timerDisplay.innerText = `Вспомни перевод... (${secondsLeft} сек)`;

    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0 && timerDisplay) {
            timerDisplay.innerText = `Вспомни перевод... (${secondsLeft} сек)`;
        } else {
            clearInterval(countdownInterval);
        }
    }, 1000);

    // === ЭТАП 3: Озвучка перевода после завершения паузы ===
    clearTimeout(wordTimeout);
    wordTimeout = setTimeout(() => {
        if (!isTraining) return;

        if (translationDisplay) translationDisplay.innerText = secondSpeechText;
        if (timerDisplay) timerDisplay.innerText = "Правильно!";

        if (currentMode === 'ru-foreign' && randomWord.customAudio) {
            if (audioTypeDisplay) audioTypeDisplay.innerText = "🎤 Звучит твой голос";
            const audio = new Audio(randomWord.customAudio);
            audio.playbackRate = currentSpeed;
            audio.play();
        } else {
            if (currentMode === 'ru-foreign') if (audioTypeDisplay) audioTypeDisplay.innerText = "🤖 Озвучка роботом";
            const secondUtterance = new SpeechSynthesisUtterance(secondSpeechText);
            secondUtterance.rate = currentSpeed;
            
            let forceSecondLang = secondSpeechLang;
            if (voiceSelect && voiceSelect.value.startsWith('fake-')) {
                if (voiceSelect.value === 'fake-ru') forceSecondLang = 'ru-RU';
                if (voiceSelect.value === 'fake-en') forceSecondLang = 'en-US';
                if (voiceSelect.value === 'fake-et') forceSecondLang = 'et-EE';
            }

            if (selectedVoice && !voiceSelect.value.startsWith('fake-')) {
                if (selectedVoice.lang.toLowerCase().startsWith(secondSpeechLang.substring(0, 2))) {
                    secondUtterance.voice = selectedVoice;
                } else {
                    secondUtterance.lang = secondSpeechLang;
                }
            } else {
                secondUtterance.lang = forceSecondLang;
            }
            window.speechSynthesis.speak(secondUtterance);
        }

        // === ЭТАП 4: Переход к следующему кругу через 2.5 секунды ===
        wordTimeout = setTimeout(() => {
            if (isTraining) nextTrainingStep();
        }, 2500);

    }, userPauseSeconds * 1000);
}
// ФУНКЦИЯ СОХРАНЕНИЯ: Отправляет данные на сервер в PostgreSQL
async function saveData() {
    const token = localStorage.getItem('userToken');
    if (!token) return; 

    localStorage.setItem('my_dictionary_current_lang', currentLanguage);

    try {
        const response = await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // Проверьте, чтобы тут стоял косой апостроф ` и пробел после Bearer!
            },
            body: JSON.stringify(appData)
        });
        
        if (!response.ok) {
            const result = await response.json();
            console.error("Ошибка сохранения на сервере:", result.error);
        }
    } catch (e) {
        console.error("Ошибка сети при сохранении данных:", e);
    }
}

// ФУНКЦИЯ ЗАГРУЗКИ: Достает данные из базы данных при старте страницы
async function loadData() {
    const token = localStorage.getItem('userToken');
    const username = localStorage.getItem('username');

    // Если токена нет в браузере, принудительно открываем окно входа
    if (!token) {
        if (document.getElementById('authScreen')) document.getElementById('authScreen').style.display = 'block';
        if (document.getElementById('mainScreen')) document.getElementById('mainScreen').style.display = 'none';
        return;
    }

    // Если токен есть, показываем основное приложение
    if (document.getElementById('authScreen')) document.getElementById('authScreen').style.display = 'none';
    if (document.getElementById('mainScreen')) document.getElementById('mainScreen').style.display = 'block';
    if (document.getElementById('userInfoText')) document.getElementById('userInfoText').innerText = `👤 Аккаунт: ${username}`;

    const savedLang = localStorage.getItem('my_dictionary_current_lang');
    if (savedLang) currentLanguage = savedLang;

    try {
        const response = await fetch('/api/data', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}` // Добавляем правильный токен
            }
        });

        if (response.status === 401 || response.status === 403) {
            handleLogout(); // Если токен не подошел бэкенду, разлогиниваем
            return;
        }

        const data = await response.json();
        appData = data;
        
        if (typeof renderTopics === 'function') {
            renderTopics(); 
        }
    } catch (e) {
        console.error("Ошибка сети при загрузке данных:", e);
    }
}
