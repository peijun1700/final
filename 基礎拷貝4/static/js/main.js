document.addEventListener('DOMContentLoaded', () => {
    const audioProcessor = new AudioProcessor();
    const themeSelector = document.getElementById('themeSelector');
    const botNameElement = document.getElementById('botName');
    const commandForm = document.getElementById('commandForm');
    const audioFileInput = document.getElementById('audioFile');
    const commandTextInput = document.getElementById('commandText');
    const avatarInput = document.getElementById('avatarInput');
    const avatarImage = document.querySelector('.avatar img');
    const listenButton = document.getElementById('listenButton');
    const fileInputText = document.querySelector('.file-input-text');
    let isListening = false;

    // 初始化 WaveSurfer
    audioProcessor.initWaveSurfer('#waveform');

    // 載入設定
    loadSettings();

    // 監聽主題變更
    themeSelector.addEventListener('change', (e) => {
        const theme = e.target.value;
        applyTheme(theme);
        localStorage.setItem('selectedTheme', theme);
        showNotification('主題已更新');
    });

    // 監聽機器人名字點擊
    botNameElement.addEventListener('click', async () => {
        const currentName = botNameElement.textContent;
        const newName = prompt('請輸入新的名字：', currentName);
        
        if (newName && newName.trim() && newName.trim() !== currentName) {
            try {
                const response = await fetch('/update-name', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name: newName.trim() })
                });
                
                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || '更新失敗');
                }
                
                const data = await response.json();
                botNameElement.textContent = data.name;
                showNotification('名字已更新');
            } catch (error) {
                console.error('Error:', error);
                showNotification(error.message || '更新名字時發生錯誤', 'error');
            }
        }
    });

    // 監聽音檔選擇
    audioFileInput.addEventListener('change', (e) => {
        const fileName = e.target.files[0]?.name || '選擇音檔';
        fileInputText.textContent = fileName;
    });

    // 監聽指令表單提交
    commandForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const audioFile = audioFileInput.files[0];
        const commandText = commandTextInput.value.trim();
        
        if (!audioFile || !commandText) {
            showNotification('請選擇音檔並輸入指令文字', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('audio', audioFile);
        formData.append('command', commandText);
        
        try {
            const response = await fetch('/upload-command', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '上傳失敗');
            }
            
            showNotification('指令已上傳');
            commandForm.reset();
            fileInputText.textContent = '選擇音檔';
            updateCommandList();
        } catch (error) {
            console.error('Error:', error);
            showNotification(error.message || '上傳指令時發生錯誤', 'error');
        }
    });

    // 監聽頭像上傳
    avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // 檢查檔案類型
        if (!file.type.startsWith('image/')) {
            showNotification('請選擇圖片檔案', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('avatar', file);
        
        try {
            const response = await fetch('/upload-avatar', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '上傳失敗');
            }
            
            const data = await response.json();
            
            // 更新頭像並添加時間戳防止快取
            const timestamp = new Date().getTime();
            avatarImage.src = `${data.url}?t=${timestamp}`;
            
            // 保存到設定檔
            await updateSettings({ avatar_url: data.url });
            
            showNotification('頭像已更新');
        } catch (error) {
            console.error('Error:', error);
            showNotification(error.message || '上傳頭像時發生錯誤', 'error');
        }
    });

    // 監聽語音按鈕
    listenButton.addEventListener('click', () => {
        if (!isListening) {
            audioProcessor.startListening();
            listenButton.textContent = '停止聆聽';
            listenButton.classList.add('listening');
            isListening = true;
        } else {
            audioProcessor.stopListening();
            listenButton.textContent = '開始聆聽';
            listenButton.classList.remove('listening');
            isListening = false;
        }
    });

    // 更新指令列表
    async function updateCommandList() {
        try {
            const response = await fetch('/get-commands');
            if (!response.ok) {
                throw new Error('無法獲取指令列表');
            }
            
            const commands = await response.json();
            const commandList = document.getElementById('commandList');
            commandList.innerHTML = '';
            
            if (commands.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'empty-message';
                emptyMessage.textContent = '尚未添加任何指令';
                commandList.appendChild(emptyMessage);
                return;
            }
            
            commands.forEach(command => {
                const item = document.createElement('div');
                item.className = 'command-item';
                item.innerHTML = `
                    <span class="command-text">${command.text}</span>
                    <div class="command-controls">
                        <button class="play-btn" title="播放">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="delete-btn" title="刪除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                
                // 播放按鈕
                const playBtn = item.querySelector('.play-btn');
                let isPlaying = false;
                let audio = null;
                
                playBtn.addEventListener('click', () => {
                    if (isPlaying && audio) {
                        // 如果正在播放，則停止
                        audio.pause();
                        audio.currentTime = 0;
                        audio = null;
                        playBtn.innerHTML = '<i class="fas fa-play"></i>';
                        isPlaying = false;
                    } else {
                        // 如果沒有播放，則開始播放
                        const audioPath = `/uploads/${command.fileName}`;
                        console.log('Playing audio:', audioPath); // 調試日誌
                        
                        audio = new Audio(audioPath);
                        
                        // 添加加載事件監聽器
                        audio.addEventListener('loadeddata', () => {
                            console.log('Audio loaded successfully'); // 調試日誌
                        });
                        
                        audio.addEventListener('ended', () => {
                            console.log('Audio playback ended'); // 調試日誌
                            playBtn.innerHTML = '<i class="fas fa-play"></i>';
                            isPlaying = false;
                            audio = null;
                        });
                        
                        audio.addEventListener('error', (e) => {
                            console.error('Audio error:', e.target.error); // 詳細錯誤信息
                            showNotification('播放音檔時發生錯誤', 'error');
                            playBtn.innerHTML = '<i class="fas fa-play"></i>';
                            isPlaying = false;
                            audio = null;
                        });
                        
                        // 使用 fetch 先檢查文件是否存在
                        fetch(audioPath)
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error(`HTTP error! status: ${response.status}`);
                                }
                                return audio.play();
                            })
                            .then(() => {
                                console.log('Audio started playing'); // 調試日誌
                                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                                isPlaying = true;
                            })
                            .catch(error => {
                                console.error('Error playing audio:', error);
                                showNotification('播放音檔時發生錯誤', 'error');
                                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                                isPlaying = false;
                                audio = null;
                            });
                    }
                });
                
                // 刪除按鈕
                item.querySelector('.delete-btn').addEventListener('click', async () => {
                    if (confirm('確定要刪除這個指令嗎？')) {
                        try {
                            const response = await fetch(`/delete-command/${command.id}`, {
                                method: 'DELETE'
                            });
                            
                            if (!response.ok) {
                                const data = await response.json();
                                throw new Error(data.error || '刪除失敗');
                            }
                            
                            item.remove();
                            showNotification('指令已刪除');
                            updateCommandList();
                        } catch (error) {
                            console.error('Error:', error);
                            showNotification(error.message || '刪除指令時發生錯誤', 'error');
                        }
                    }
                });
                
                commandList.appendChild(item);
            });
        } catch (error) {
            console.error('Error:', error);
            showNotification('載入指令列表時發生錯誤', 'error');
        }
    }

    // 載入設定
    async function loadSettings() {
        try {
            const response = await fetch('/get-settings');
            if (!response.ok) {
                throw new Error('無法獲取設定');
            }
            
            const settings = await response.json();
            
            // 設置機器人名字
            if (settings.bot_name) {
                botNameElement.textContent = settings.bot_name;
            }
            
            // 設置頭像
            if (settings.avatar_url) {
                avatarImage.src = settings.avatar_url;
            }
            
            // 設置主題
            const savedTheme = localStorage.getItem('selectedTheme');
            if (savedTheme) {
                themeSelector.value = savedTheme;
                applyTheme(savedTheme);
            }
            
            // 載入指令列表
            updateCommandList();
        } catch (error) {
            console.error('Error:', error);
            showNotification('載入設定時發生錯誤', 'error');
        }
    }

    // 更新設定
    async function updateSettings(newSettings) {
        try {
            const response = await fetch('/get-settings');
            if (!response.ok) {
                throw new Error('無法獲取設定');
            }
            
            const currentSettings = await response.json();
            const settings = { ...currentSettings, ...newSettings };
            
            const settingsResponse = await fetch('/update-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            
            if (!settingsResponse.ok) {
                throw new Error('無法更新設定');
            }
        } catch (error) {
            console.error('Error updating settings:', error);
        }
    }

    // 應用主題
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.className = theme;
    }
});

// 主題管理器類別
class ThemeManager {
    constructor() {
        this.themes = {
            default: {
                primary: '#98D8AA',
                secondary: '#F5F5F5',
                text: '#333333',
                accent: '#FF9B9B',
                background: 'linear-gradient(135deg, #98D8AA 0%, #FF9B9B 100%)',
                shadow: 'rgba(0, 0, 0, 0.1)'
            },
            dark: {
                primary: '#2C3E50',
                secondary: '#34495E',
                text: '#ECF0F1',
                accent: '#3498DB',
                background: 'linear-gradient(135deg, #2C3E50 0%, #3498DB 100%)',
                shadow: 'rgba(0, 0, 0, 0.2)'
            },
            warm: {
                primary: '#FF9F43',
                secondary: '#FFF3E0',
                text: '#5D4037',
                accent: '#FF6B6B',
                background: 'linear-gradient(135deg, #FF9F43 0%, #FF6B6B 100%)',
                shadow: 'rgba(93, 64, 55, 0.1)'
            },
            ocean: {
                primary: '#4FB0C6',
                secondary: '#E8F4F6',
                text: '#2C3E50',
                accent: '#FF8C69',
                background: 'linear-gradient(135deg, #4FB0C6 0%, #FF8C69 100%)',
                shadow: 'rgba(44, 62, 80, 0.1)'
            },
            forest: {
                primary: '#4CAF50',
                secondary: '#E8F5E9',
                text: '#1B5E20',
                accent: '#FFA000',
                background: 'linear-gradient(135deg, #4CAF50 0%, #FFA000 100%)',
                shadow: 'rgba(27, 94, 32, 0.1)'
            }
        };

        this.initializeThemeSelector();
    }

    initializeThemeSelector() {
        const savedTheme = localStorage.getItem('selectedTheme') || 'default';
        this.applyTheme(savedTheme);
    }

    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (!theme) return;

        document.documentElement.style.setProperty('--primary-color', theme.primary);
        document.documentElement.style.setProperty('--secondary-color', theme.secondary);
        document.documentElement.style.setProperty('--text-color', theme.text);
        document.documentElement.style.setProperty('--accent-color', theme.accent);
        document.documentElement.style.setProperty('--background', theme.background);
        document.documentElement.style.setProperty('--shadow-color', theme.shadow);
    }
}

// 動畫效果
function animateButton(buttonId) {
    const button = document.getElementById(buttonId);
    button.classList.add('active');
    setTimeout(() => button.classList.remove('active'), 200);
}

// 通知功能
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
