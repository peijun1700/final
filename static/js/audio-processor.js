class AudioProcessor {
    constructor(wavesurfer) {
        this.wavesurfer = wavesurfer;
        this.isListening = false;
        this.recognition = null;
        this.lastProcessedText = '';
        this.processingTimeout = null;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 3;
        this.restartDelay = 50;
        this.noSpeechTimeout = null;
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

            // 如果上下文被暫停，嘗試恢復
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
                this.clearNoSpeechTimeout();
                this.setNoSpeechTimeout();
                showNotification('開始聆聽...', 'info', 1000);
            };

            this.recognition.onend = () => {
                this.clearNoSpeechTimeout();
                
                if (this.isListening && this.restartAttempts < this.maxRestartAttempts) {
                    this.restartAttempts++;
                    setTimeout(() => {
                        if (this.isListening) {
                            try {
                                this.recognition.start();
                            } catch (error) {
                                if (error.name !== 'InvalidStateError') {
                                    console.error('重啟失敗:', error);
                                    this.handleRecognitionError(error);
                                }
                            }
                        }
                    }, this.restartDelay);
                } else if (this.restartAttempts >= this.maxRestartAttempts) {
                    this.isListening = false;
                    showNotification('請重新開始語音識別', 'warning');
                }
            };

            this.recognition.onresult = async (event) => {
                try {
                    const result = event.results[event.results.length - 1];
                    
                    if (result.isFinal) {
                        const text = result[0].transcript.trim().toLowerCase();
                        if (text && text !== this.lastProcessedText) {
                            this.lastProcessedText = text;
                            this.clearNoSpeechTimeout();
                            await this.processCommand(text);
                            this.setNoSpeechTimeout();
                        }
                    } else {
                        const tempText = result[0].transcript;
                        if (tempText) {
                            showNotification(tempText, 'info', 300);
                        }
                    }
                } catch (error) {
                    console.error('處理識別結果出錯:', error);
                }
            };

            this.recognition.onerror = (event) => {
                if (event.error !== 'no-speech') {
                    this.handleRecognitionError(event);
                }
            };
        } else {
            console.error('瀏覽器不支援語音識別');
            showNotification('您的瀏覽器不支援語音識別', 'error');
        }
    }

    setNoSpeechTimeout() {
        this.clearNoSpeechTimeout();
        this.noSpeechTimeout = setTimeout(() => {
            if (this.isListening) {
                this.restartRecognition();
            }
        }, 10000);
    }

    clearNoSpeechTimeout() {
        if (this.noSpeechTimeout) {
            clearTimeout(this.noSpeechTimeout);
            this.noSpeechTimeout = null;
        }
    }

    restartRecognition() {
        if (this.recognition && this.isListening) {
            try {
                this.recognition.stop();
                setTimeout(() => {
                    if (this.isListening) {
                        this.recognition.start();
                    }
                }, this.restartDelay);
            } catch (error) {
                if (error.name !== 'InvalidStateError') {
                    console.error('重啟識別失敗:', error);
                }
            }
        }
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
            case 'aborted':
                return;
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
            
            if (!this.isListening) {
                this.isListening = true;
                this.lastProcessedText = '';
                this.restartAttempts = 0;
                try {
                    this.recognition.start();
                } catch (error) {
                    if (error.name !== 'InvalidStateError') {
                        console.error('啟動失敗:', error);
                        this.handleRecognitionError(error);
                    }
                }
            }
        } catch (error) {
            console.error('啟動失敗:', error);
            this.handleRecognitionError(error);
        }
    }

    stopListening() {
        this.isListening = false;
        this.clearNoSpeechTimeout();
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
                const wasListening = this.isListening;
                if (wasListening) {
                    this.stopListening();
                }

                showNotification(`執行: ${data.command}`, 'success', 1000);
                
                if (data.audio) {
                    try {
                        await this.initAudioContext();
                        await this.playAudio('/uploads/' + data.audio);
                        
                        if (wasListening) {
                            setTimeout(() => {
                                this.startListening();
                            }, this.restartDelay);
                        }
                    } catch (error) {
                        console.error('播放失敗:', error);
                        showNotification('播放失敗', 'error');
                        if (wasListening) {
                            this.startListening();
                        }
                    }
                }
            }
        } catch (error) {
            console.error('處理失敗:', error);
            showNotification('處理失敗', 'error');
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
