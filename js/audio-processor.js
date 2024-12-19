class AudioProcessor {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.wavesurfer = null;
        this.recognition = new webkitSpeechRecognition();
        this.setupRecognition();
        this.isListening = false;
    }

    setupRecognition() {
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'zh-TW';

        this.recognition.onstart = () => {
            console.log('語音辨識已開始');
            this.isListening = true;
            document.querySelector('.avatar').classList.add('listening');
        };

        this.recognition.onend = () => {
            console.log('語音辨識已結束');
            this.isListening = false;
            document.querySelector('.avatar').classList.remove('listening');
        };

        this.recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0])
                .map(result => result.transcript)
                .join('');

            console.log('辨識結果:', transcript);
            
            // 檢查是否有匹配的指令
            this.checkCommands(transcript.toLowerCase());
        };

        this.recognition.onerror = (event) => {
            console.error('語音辨識錯誤:', event.error);
            this.isListening = false;
            document.querySelector('.avatar').classList.remove('listening');
            showNotification('語音辨識發生錯誤', 'error');
        };
    }

    initWaveSurfer(container) {
        this.wavesurfer = WaveSurfer.create({
            container: container,
            waveColor: '#4A9EFF',
            progressColor: '#2D5BFF',
            height: 50,
            barWidth: 2,
            barGap: 1,
            barRadius: 2,
            normalize: true,
            responsive: true,
            fillParent: true
        });
    }

    async startListening() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
                // 載入音頻到波形顯示器
                await this.wavesurfer.load(audioUrl);
                
                // 清理資源
                URL.revokeObjectURL(audioUrl);
            };

            this.mediaRecorder.start();
            document.querySelector('.avatar').classList.add('speaking');
        } catch (error) {
            console.error('Error starting recording:', error);
            showNotification('無法啟動錄音功能', 'error');
        }
    }

    stopListening() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            
            document.querySelector('.avatar').classList.remove('speaking');
        }
    }

    loadAudio(audioUrl) {
        return this.wavesurfer.load(audioUrl);
    }

    playAudio() {
        if (this.wavesurfer) {
            this.wavesurfer.play();
        }
    }

    pauseAudio() {
        if (this.wavesurfer) {
            this.wavesurfer.pause();
        }
    }

    async checkCommands(transcript) {
        try {
            const response = await fetch('/check-command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ transcript: transcript })
            });

            const result = await response.json();
            if (result.match) {
                showNotification(`執行指令: ${result.command}`);
                // 在這裡執行對應的動作
            }
        } catch (error) {
            console.error('Error checking commands:', error);
            showNotification('處理指令時發生錯誤', 'error');
        }
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// 導出給其他檔案使用
