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
document.addEventListener('DOMContentLoaded', function() {
    // 初始化主題管理器
    const themeManager = new ThemeManager();
    
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
    audioProcessor = new AudioProcessor(wavesurfer);

    // 獲取元素
    const startListeningBtn = document.getElementById('startListeningBtn');
    const uploadForm = document.getElementById('uploadForm');
    const avatarUpload = document.getElementById('avatarUpload');
    const avatar = document.getElementById('avatar');

    // 載入保存的頭像
    loadSavedAvatar();

    // 語音聆聽功能
    if (startListeningBtn) {
        startListeningBtn.addEventListener('click', function() {
            if (!audioProcessor.isListening) {
                audioProcessor.startListening();
                this.innerHTML = '<i class="fas fa-microphone-slash"></i> 停止聆聽';
                this.classList.add('listening');
            } else {
                audioProcessor.stopListening();
                this.innerHTML = '<i class="fas fa-microphone"></i> 開始聆聽';
                this.classList.remove('listening');
            }
        });
    }

    // 頭像上傳處理
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
            avatar.src = '/uploads/' + data.avatar + '?t=' + new Date().getTime();
            showNotification('頭像更新成功', 'success');
        } catch (error) {
            console.error('上傳頭像失敗:', error);
            showNotification(error.message || '上傳失敗', 'error');
        }
    });

    // 指令上傳處理
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

    // 載入保存的頭像
    async function loadSavedAvatar() {
        try {
            const response = await fetch('/get-settings');
            const data = await response.json();
            if (data.avatar) {
                // 從 uploads 目錄獲取頭像
                avatar.src = '/uploads/' + data.avatar + '?t=' + new Date().getTime();
            }
        } catch (error) {
            console.error('載入頭像失敗:', error);
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
            
            const commandList = document.getElementById('commandList');
            if (!commandList) {
                console.error('找不到指令列表元素');
                return;
            }

            commandList.innerHTML = '';
            
            if (!Array.isArray(commands) || commands.length === 0) {
                commandList.innerHTML = '<div class="empty-message">目前沒有任何指令</div>';
                return;
            }
            
            commands.forEach(command => {
                const li = document.createElement('div');
                li.className = 'command-item';
                
                const commandText = document.createElement('span');
                commandText.textContent = command.text;
                commandText.className = 'command-text';
                
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'command-buttons';
                
                // 播放按鈕
                const playButton = document.createElement('button');
                playButton.className = 'play-button';
                playButton.innerHTML = '<i class="fas fa-play"></i>';
                playButton.onclick = () => audioProcessor.playAudio('/uploads/' + command.audio);
                
                // 刪除按鈕
                const deleteButton = document.createElement('button');
                deleteButton.className = 'delete-button';
                deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
                deleteButton.onclick = async () => {
                    if (confirm('確定要刪除這個指令嗎？')) {
                        try {
                            const response = await fetch('/delete-command', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ text: command.text })
                            });
                            
                            if (!response.ok) {
                                throw new Error('刪除失敗');
                            }
                            
                            showNotification('指令已刪除', 'success');
                            updateCommandList();
                        } catch (error) {
                            console.error('刪除指令失敗:', error);
                            showNotification('刪除失敗', 'error');
                        }
                    }
                };
                
                buttonContainer.appendChild(playButton);
                buttonContainer.appendChild(deleteButton);
                
                li.appendChild(commandText);
                li.appendChild(buttonContainer);
                commandList.appendChild(li);
            });
        } catch (error) {
            console.error('更新指令列表失敗:', error);
            showNotification('更新指令列表失敗', 'error');
        }
    }

    // 顯示通知
    function showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';

        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }

    // 初始化頁面時更新指令列表
    updateCommandList();
});
