class AudioProcessor {
    constructor(wavesurfer) {
        this.wavesurfer = wavesurfer;
        this.isListening = false;
        this.recognition = null;
        this.lastProcessedText = '';
        this.processingCommand = false;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 3;
        this.restartDelay = 10; // 降低重啟延遲
        this.commandQueue = [];
        this.isProcessingQueue = false;
        this.audioContext = null;
        this.initSpeechRecognition();
    }

    async initAudioContext() {
        if (this.audioContext) return;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive',
                sampleRate: 48000
            });

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        } catch (error) {
            console.error('無法初始化音頻上下文:', error);
        }
    }

    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'zh-TW';
            this.recognition.maxAlternatives = 1;

            this.recognition.onstart = () => {
                this.restartAttempts = 0;
                this.isListening = true;
                showNotification('開始聆聽...', 'info', 500);
            };

            this.recognition.onend = () => {
                if (this.isListening && !this.processingCommand) {
                    if (this.restartAttempts < this.maxRestartAttempts) {
                        this.restartAttempts++;
                        this.restartRecognition();
                    } else {
                        this.isListening = false;
                        showNotification('請重新開始語音識別', 'warning');
                    }
                }
            };

            this.recognition.onresult = (event) => {
                const result = event.results[event.results.length - 1];
                
                if (result.isFinal) {
                    const text = result[0].transcript.trim().toLowerCase();
                    if (text && text !== this.lastProcessedText) {
                        this.lastProcessedText = text;
                        this.addToQueue(text);
                    }
                } else {
                    const tempText = result[0].transcript;
                    if (tempText) {
                        showNotification(tempText, 'info', 300);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    this.handleRecognitionError(event);
                }
            };
        } else {
            console.error('瀏覽器不支援語音識別');
            showNotification('您的瀏覽器不支援語音識別', 'error');
        }
    }

    addToQueue(text) {
        this.commandQueue.push(text);
        if (!this.isProcessingQueue) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.isProcessingQueue || this.commandQueue.length === 0) return;
        
        this.isProcessingQueue = true;
        
        while (this.commandQueue.length > 0) {
            const text = this.commandQueue.shift();
            await this.processCommand(text);
        }
        
        this.isProcessingQueue = false;
    }

    restartRecognition() {
        if (!this.recognition || !this.isListening || this.processingCommand) return;
        
        setTimeout(() => {
            try {
                this.recognition.start();
            } catch (error) {
                if (error.name !== 'InvalidStateError') {
                    console.error('重啟識別失敗:', error);
                }
            }
        }, this.restartDelay);
    }

    handleRecognitionError(event) {
        let message = '語音識別錯誤';
        
        switch (event.error) {
            case 'network':
                message = '網絡連接不穩定';
                break;
            case 'audio-capture':
                message = '無法訪問麥克風';
                break;
            case 'not-allowed':
                message = '請允許使用麥克風';
                break;
        }
        
        showNotification(message, 'error');
        
        if (['audio-capture', 'not-allowed', 'network'].includes(event.error)) {
            this.isListening = false;
            this.restartAttempts = this.maxRestartAttempts;
        }
    }

    async startListening() {
        if (!this.recognition) {
            showNotification('語音識別不可用', 'error');
            return;
        }

        try {
            await this.initAudioContext();
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    latency: 0,
                    sampleRate: 48000
                } 
            });

            stream.getTracks().forEach(track => track.stop());
            
            this.isListening = true;
            this.lastProcessedText = '';
            this.restartAttempts = 0;
            this.processingCommand = false;
            this.commandQueue = [];
            
            try {
                this.recognition.start();
            } catch (error) {
                if (error.name !== 'InvalidStateError') {
                    console.error('啟動失敗:', error);
                    this.handleRecognitionError(error);
                }
            }
        } catch (error) {
            console.error('啟動失敗:', error);
            this.handleRecognitionError(error);
        }
    }

    stopListening() {
        this.isListening = false;
        this.processingCommand = false;
        this.commandQueue = [];
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                if (error.name !== 'InvalidStateError') {
                    console.error('停止識別失敗:', error);
                }
            }
        }
    }

    async processCommand(text) {
        if (!text || text.length < 2) return;

        try {
            this.processingCommand = true;
            
            const response = await fetch('/process-command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ command: text })
            });

            if (!response.ok) throw new Error('處理失敗');

            const data = await response.json();
            
            if (data.match) {
                showNotification(`執行: ${data.command}`, 'success', 1000);
                
                if (data.audio) {
                    try {
                        await this.initAudioContext();
                        await this.playAudio('/uploads/' + data.audio);
                    } catch (error) {
                        console.error('播放失敗:', error);
                        showNotification('播放失敗', 'error');
                    }
                }
            }
        } catch (error) {
            console.error('處理失敗:', error);
            showNotification('處理失敗', 'error');
        } finally {
            this.processingCommand = false;
            if (this.isListening) {
                this.restartRecognition();
            }
        }
    }

    async playAudio(audioUrl) {
        try {
            await this.initAudioContext();
            await this.wavesurfer.load(audioUrl);
            this.wavesurfer.play();
            return new Promise((resolve) => {
                this.wavesurfer.once('finish', resolve);
            });
        } catch (error) {
            console.error('播放出錯:', error);
            throw error;
        }
    }
}

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
