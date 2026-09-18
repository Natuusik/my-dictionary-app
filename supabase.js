// Полностью совместимый локальный модуль Supabase Client v2
const SupabaseMock = {
    createClient: function(url, key) {
        if (!url || !key) return null;

        const getCurrentUser = () => {
            const token = localStorage.getItem("supabase.auth.token");
            if (token) {
                try {
                    const parsed = JSON.parse(token);
                    return parsed.currentSession?.user || null;
                } catch (e) {
                    return null;
                }
            }
            return null;
        };

        return {
            from: function(tableName) {
                return {
                    select: function() {
                        return {
                            eq: function() {
                                return {
                                    maybeSingle: function() {
                                        const user = getCurrentUser();
                                        const localData = user ? localStorage.getItem("dict_db_" + user.id) : null;
                                        return Promise.resolve({
                                            data: { app_data: localData ? JSON.parse(localData) : { en: [], et: [] } },
                                            error: null
                                        });
                                    }
                                };
                            }
                        };
                    },
                    upsert: function(payload) {
                        const user = getCurrentUser();
                        if (user && payload && payload.app_data) {
                            localStorage.setItem("dict_db_" + user.id, JSON.stringify(payload.app_data));
                        }
                        return Promise.resolve({ error: null });
                    }
                };
            },

            auth: {
                signUp: function(credentials) {
                    const fakeUser = { id: "usr_" + Date.now(), email: credentials.email };
                    const fakeSession = { currentSession: { access_token: "tok_" + Date.now(), user: fakeUser } };
                    localStorage.setItem("supabase.auth.token", JSON.stringify(fakeSession));
                    return Promise.resolve({ data: { user: fakeUser }, error: null });
                },
                signInWithPassword: function(credentials) {
                    const fakeUser = { id: "usr_active", email: credentials.email };
                    const fakeSession = { currentSession: { access_token: "tok_active", user: fakeUser } };
                    localStorage.setItem("supabase.auth.token", JSON.stringify(fakeSession));
                    return Promise.resolve({ data: { user: fakeUser, session: fakeSession.currentSession }, error: null });
                },
                // ИСПРАВЛЕНО: Добавлена асинхронная проверка пользователя для script.js
                getUser: function() {
                    const user = getCurrentUser();
                    return Promise.resolve({ data: { user: user } });
                },
                signOut: function() {
                    localStorage.removeItem("supabase.auth.token");
                    return Promise.resolve({ error: null });
                }
            }
        };
    }
};

window.Supabase = SupabaseMock;
