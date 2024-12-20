class AudioProcessor {
    constructor(wavesurfer) {
        this.wavesurfer = wavesurfer;
        this.isListening = false;
        this.recognition = null;
        this.lastProcessedText = '';
        this.processingTimeout = null;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 3;
        this.restartDelay = 50; // 降低重啟延遲
        this.noSpeechTimeout = null;
        this.audioContext = null;
        this.initSpeechRecognition();
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive',
                sampleRate: 48000
            });
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
                    // 使用 requestAnimationFrame 優化重啟時機
                    requestAnimationFrame(() => {
                        if (this.isListening) {
                            try {
                                this.recognition.start();
                            } catch (error) {
                                console.error('重啟失敗:', error);
                                this.handleRecognitionError(error);
                            }
                        }
                    });
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
        }, 10000); // 10秒無語音自動重啟
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
                requestAnimationFrame(() => {
                    if (this.isListening) {
                        this.recognition.start();
                    }
                });
            } catch (error) {
                console.error('重啟識別失敗:', error);
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
                return; // 忽略中斷錯誤
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
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    latency: 0,
                    sampleRate: 48000
                } 
            });

            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            stream.getTracks().forEach(track => track.stop());
            
            this.isListening = true;
            this.lastProcessedText = '';
            this.restartAttempts = 0;
            this.recognition.start();
            
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
                console.error('停止識別失敗:', error);
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
                        if (this.audioContext && this.audioContext.state === 'suspended') {
                            await this.audioContext.resume();
                        }
                        await this.playAudio('/uploads/' + data.audio);
                        
                        if (wasListening) {
                            // 使用 requestAnimationFrame 優化重啟時機
                            requestAnimationFrame(() => {
                                this.startListening();
                            });
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
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
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
        
        // 使用 requestAnimationFrame 優化動畫
        requestAnimationFrame(() => {
            setTimeout(() => {
                notification.style.display = 'none';
            }, duration);
        });
    }
}
