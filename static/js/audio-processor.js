class AudioProcessor {
    constructor(wavesurfer) {
        this.wavesurfer = wavesurfer;
        this.isListening = false;
        this.recognition = null;
        this.lastProcessedText = '';
        this.processingTimeout = null;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 5;
        this.restartDelay = 100; // 降低重啟延遲
        this.initSpeechRecognition();
    }

    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'zh-TW';
            this.recognition.maxAlternatives = 1; // 減少候選數量以提高速度

            this.recognition.onstart = () => {
                console.log('語音識別已啟動');
                showNotification('開始聆聽...', 'info');
                this.restartAttempts = 0;
            };

            this.recognition.onend = () => {
                console.log('語音識別已結束');
                if (this.isListening) {
                    if (this.restartAttempts < this.maxRestartAttempts) {
                        this.restartAttempts++;
                        console.log(`重新啟動語音識別 (${this.restartAttempts}/${this.maxRestartAttempts})`);
                        // 立即重啟
                        if (this.isListening) {
                            try {
                                this.recognition.start();
                            } catch (error) {
                                console.error('重新啟動失敗:', error);
                                this.handleRecognitionError(error);
                            }
                        }
                    } else {
                        console.log('達到最大重試次數');
                        this.isListening = false;
                        showNotification('請重新啟動語音識別', 'warning');
                    }
                }
            };

            this.recognition.onresult = async (event) => {
                try {
                    const result = event.results[event.results.length - 1];
                    
                    if (result.isFinal) {
                        const text = result[0].transcript.trim().toLowerCase();
                        console.log('最終識別結果:', text);
                        
                        if (text && text !== this.lastProcessedText) {
                            this.lastProcessedText = text;
                            showNotification('識別到: ' + text, 'info');
                            
                            // 立即處理指令
                            await this.processCommand(text);
                        }
                    } else {
                        // 顯示臨時結果以提供即時反饋
                        const tempText = result[0].transcript;
                        if (tempText) {
                            console.log('臨時識別:', tempText);
                            showNotification('正在識別: ' + tempText, 'info', 500);
                        }
                    }
                } catch (error) {
                    console.error('處理識別結果出錯:', error);
                }
            };

            this.recognition.onerror = (event) => {
                this.handleRecognitionError(event);
            };
        } else {
            console.error('瀏覽器不支援語音識別');
            showNotification('您的瀏覽器不支援語音識別', 'error');
        }
    }

    handleRecognitionError(event) {
        console.error('語音識別錯誤:', event.error);
        let message = '語音識別錯誤';
        
        switch (event.error) {
            case 'no-speech':
                message = '未檢測到語音';
                break;
            case 'audio-capture':
                message = '無法訪問麥克風';
                break;
            case 'not-allowed':
                message = '請允許使用麥克風';
                break;
            case 'network':
                message = '網絡連接出錯';
                break;
            case 'aborted':
                message = '語音識別被中斷';
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
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    latency: 0, // 最小延遲
                    sampleRate: 48000 // 提高採樣率
                } 
            });
            stream.getTracks().forEach(track => track.stop());
            
            this.isListening = true;
            this.lastProcessedText = '';
            this.restartAttempts = 0;
            await this.recognition.start();
            
        } catch (error) {
            console.error('啟動語音識別失敗:', error);
            this.handleRecognitionError(error);
        }
    }

    stopListening() {
        if (this.recognition) {
            this.isListening = false;
            this.restartAttempts = this.maxRestartAttempts;
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('停止語音識別時出錯:', error);
            }
            this.lastProcessedText = '';
        }
    }

    async processCommand(text) {
        if (!text || text.length < 2) return;

        try {
            console.log('處理指令:', text);
            
            const response = await fetch('/process-command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ command: text })
            });

            if (!response.ok) throw new Error('處理指令失敗');

            const data = await response.json();
            
            if (data.match) {
                console.log('找到匹配指令:', data.command);
                
                const wasListening = this.isListening;
                if (wasListening) {
                    this.stopListening();
                }

                showNotification(`執行指令: ${data.command}`, 'success');
                
                if (data.audio) {
                    try {
                        console.log('播放音頻:', data.audio);
                        await this.playAudio('/uploads/' + data.audio);
                        console.log('音頻播放完成');
                        
                        if (wasListening) {
                            // 立即恢復語音識別
                            this.startListening();
                        }
                    } catch (error) {
                        console.error('音頻播放失敗:', error);
                        showNotification('音頻播放失敗', 'error');
                        if (wasListening) {
                            this.startListening();
                        }
                    }
                }
            } else {
                showNotification('未找到匹配的指令', 'info');
            }
        } catch (error) {
            console.error('處理指令失敗:', error);
            showNotification('處理指令失敗: ' + error.message, 'error');
        }
    }

    async playAudio(audioUrl) {
        try {
            await this.wavesurfer.load(audioUrl);
            this.wavesurfer.play();
            return new Promise((resolve) => {
                this.wavesurfer.once('finish', resolve);
            });
        } catch (error) {
            console.error('播放音頻出錯:', error);
            throw error;
        }
    }
}

function showNotification(message, type = 'info', duration = 3000) {
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
