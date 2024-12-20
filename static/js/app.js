// 全局變量
let audioProcessor = null;

// 載入指令列表
async function loadCommands() {
    try {
        const response = await fetch('/get-commands');
        if (!response.ok) {
            throw new Error('獲取命令列表失敗');
        }
        const commands = await response.json();
        updateCommandList(commands);
    } catch (error) {
        console.error('Error:', error);
        showNotification('載入命令列表失敗', 'error');
    }
}

// 當文檔加載完成時初始化
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // 初始化 WaveSurfer
        const wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4F4A85',
            progressColor: '#383351',
            cursorColor: '#383351',
            barWidth: 3,
            barRadius: 3,
            cursorWidth: 1,
            height: 80,
            barGap: 3
        });

        // 初始化音頻處理器
        window.audioProcessor = new AudioProcessor(wavesurfer);

        // 載入頭像和指令列表
        await Promise.all([
            loadSavedAvatar(),
            updateCommandList()
        ]);

        // 設置事件監聽器
        setupEventListeners();
    } catch (error) {
        console.error('初始化失敗:', error);
        showNotification('初始化失敗，請重新整理頁面', 'error');
    }
});

// 設置事件監聽器
function setupEventListeners() {
    // 上傳頭像
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) {
        avatarInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                const formData = new FormData();
                formData.append('avatar', file);

                try {
                    const response = await fetch('/upload-avatar', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        throw new Error('上傳失敗');
                    }

                    await loadSavedAvatar();
                    showNotification('頭像上傳成功', 'success');
                } catch (error) {
                    console.error('上傳失敗:', error);
                    showNotification('上傳失敗', 'error');
                }
            }
        });
    }

    // 開始錄音按鈕
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.addEventListener('click', () => {
            if (!window.audioProcessor.isListening) {
                window.audioProcessor.startListening();
                startButton.textContent = '停止';
                startButton.classList.add('recording');
            } else {
                window.audioProcessor.stopListening();
                startButton.textContent = '開始';
                startButton.classList.remove('recording');
            }
        });
    }

    // 頭像上傳處理
    const avatarUpload = document.getElementById('avatarUpload');
    avatarUpload.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 檢查文件類型
        if (!file.type.startsWith('image/')) {
            showNotification('請選擇圖片文件', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const response = await fetch('/upload-avatar', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '上傳失敗');
            }

            // 更新頭像顯示，使用 uploads 路徑
            const avatar = document.getElementById('avatar');
            avatar.src = '/uploads/' + data.avatar + '?t=' + new Date().getTime();
            showNotification('頭像更新成功', 'success');
        } catch (error) {
            console.error('上傳頭像失敗:', error);
            showNotification(error.message || '上傳失敗', 'error');
        }
    });

    // 指令上傳處理
    const uploadForm = document.getElementById('uploadForm');
    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const commandInput = document.getElementById('command');
        const audioInput = document.getElementById('audio');

        if (!commandInput.value || !audioInput.files[0]) {
            showNotification('請填寫指令並選擇音頻文件', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('text', commandInput.value);
        formData.append('audio', audioInput.files[0]);

        try {
            const response = await fetch('/add-command', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '上傳失敗');
            }

            showNotification('指令添加成功', 'success');
            uploadForm.reset();
            updateCommandList();
        } catch (error) {
            console.error('上傳指令失敗:', error);
            showNotification('上傳失敗', 'error');
        }
    });

    // 語音聆聽功能
    const startListeningBtn = document.getElementById('startListeningBtn');
    if (startListeningBtn) {
        startListeningBtn.addEventListener('click', function() {
            if (!window.audioProcessor.isListening) {
                window.audioProcessor.startListening();
                this.innerHTML = '<i class="fas fa-microphone-slash"></i> 停止聆聽';
                this.classList.add('listening');
            } else {
                window.audioProcessor.stopListening();
                this.innerHTML = '<i class="fas fa-microphone"></i> 開始聆聽';
                this.classList.remove('listening');
            }
        });
    }
}

// 載入保存的頭像
async function loadSavedAvatar() {
    try {
        const response = await fetch('/get-settings');
        const data = await response.json();
        const avatar = document.getElementById('avatar');
        if (avatar) {
            if (data.avatar) {
                avatar.src = '/uploads/' + data.avatar + '?t=' + new Date().getTime();
            } else {
                avatar.src = '/static/images/default-avatar.png';
            }
        }
    } catch (error) {
        console.error('載入頭像失敗:', error);
        const avatar = document.getElementById('avatar');
        if (avatar) {
            avatar.src = '/static/images/default-avatar.png';
        }
    }
}

// 更新指令列表
async function updateCommandList() {
    try {
        const response = await fetch('/get-commands');
        if (!response.ok) {
            throw new Error('獲取指令列表失敗');
        }
        const commands = await response.json();
        const commandsList = document.getElementById('commandsList');
        
        if (!commandsList) {
            console.error('找不到指令列表元素');
            return;
        }

        commandsList.innerHTML = '';
        
        if (!Array.isArray(commands) || commands.length === 0) {
            commandsList.innerHTML = '<div class="empty-message">目前沒有任何指令</div>';
            return;
        }

        commands.forEach(command => {
            const li = document.createElement('li');
            li.className = 'command-item';
            
            const textSpan = document.createElement('span');
            textSpan.textContent = command.text;
            textSpan.className = 'command-text';
            
            const deleteButton = document.createElement('button');
            deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
            deleteButton.className = 'delete-btn';
            
            deleteButton.onclick = async () => {
                try {
                    const response = await fetch('/delete-command', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ text: command.text })
                    });

                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || '刪除失敗');
                    }

                    showNotification('指令已刪除', 'success');
                    await updateCommandList();
                } catch (error) {
                    console.error('刪除指令失敗:', error);
                    showNotification(error.message || '刪除失敗', 'error');
                }
            };

            const playButton = document.createElement('button');
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.className = 'play-btn';
            
            playButton.onclick = async () => {
                try {
                    await window.audioProcessor.playAudioBuffer('/uploads/' + command.audio);
                } catch (error) {
                    console.error('播放失敗:', error);
                    showNotification('播放失敗', 'error');
                }
            };
            
            li.appendChild(textSpan);
            li.appendChild(playButton);
            li.appendChild(deleteButton);
            commandsList.appendChild(li);
        });
    } catch (error) {
        console.error('更新指令列表失敗:', error);
        showNotification('更新指令列表失敗', 'error');
        
        const commandsList = document.getElementById('commandsList');
        if (commandsList) {
            commandsList.innerHTML = '<div class="error-message">載入失敗，請重試</div>';
        }
    }
}

// 顯示通知
function showNotification(message, type = 'info', duration = 2000) {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = 'notification ' + type;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, duration);
    }
}
