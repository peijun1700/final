class AudioProcessor {
    constructor(wavesurfer) {
        this.wavesurfer = wavesurfer;
        this.isListening = false;
        this.recognition = null;
        this.lastProcessedText = '';
        this.processingTimeout = null;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 3;
        this.restartDelay = 1000;
        this.initSpeechRecognition();
    }

    // 初始化語音識別
    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'zh-TW';
            this.recognition.maxAlternatives = 3;

            // 增加語音識別的超時時間
            if (this.recognition.maxSpeechTime !== undefined) {
                this.recognition.maxSpeechTime = 60000; // 60秒
            }

            this.recognition.onstart = () => {
                console.log('%c語音識別已啟動', 'color: green; font-weight: bold');
                showNotification('開始聆聽...', 'info');
                this.restartAttempts = 0;
            };

            this.recognition.onend = () => {
                console.log('%c語音識別已結束', 'color: orange; font-weight: bold');
                if (this.isListening) {
                    if (this.restartAttempts < this.maxRestartAttempts) {
                        this.restartAttempts++;
                        console.log(`嘗試重新啟動語音識別 (${this.restartAttempts}/${this.maxRestartAttempts})`);
                        setTimeout(() => {
                            if (this.isListening) {
                                try {
                                    this.recognition.start();
                                } catch (error) {
                                    console.error('重新啟動語音識別失敗:', error);
                                    this.handleRecognitionError(error);
                                }
                            }
                        }, this.restartDelay);
                    } else {
                        console.log('達到最大重試次數，停止語音識別');
                        this.isListening = false;
                        showNotification('語音識別已停止，請手動重新啟動', 'warning');
                    }
                }
            };

            this.recognition.onresult = async (event) => {
                try {
                    const result = event.results[event.results.length - 1];
                    
                    if (result.isFinal) {
                        console.log('%c語音識別結果:', 'color: purple; font-weight: bold');
                        for (let i = 0; i < result.length; i++) {
                            console.log(`候選 ${i + 1}: ${result[i].transcript} (置信度: ${result[i].confidence.toFixed(4)})`);
                        }
                        
                        const text = result[0].transcript.trim().toLowerCase();
                        console.log('%c最終識別結果:', 'color: blue; font-weight: bold', text);
                        
                        if (text && text !== this.lastProcessedText) {
                            this.lastProcessedText = text;
                            showNotification('識別到: ' + text, 'info');
                            
                            if (this.processingTimeout) {
                                clearTimeout(this.processingTimeout);
                            }
                            
                            this.processingTimeout = setTimeout(async () => {
                                await this.processCommand(text);
                            }, 300);
                        }
                    } else {
                        const tempText = result[0].transcript;
                        if (tempText) {
                            console.log('%c臨時識別結果:', 'color: gray', tempText);
                        }
                    }
                } catch (error) {
                    console.error('處理語音識別結果時出錯:', error);
                }
            };

            this.recognition.onerror = (event) => {
                this.handleRecognitionError(event);
            };
        } else {
            console.error('%c瀏覽器不支援語音識別', 'color: red; font-weight: bold');
            showNotification('您的瀏覽器不支援語音識別', 'error');
        }
    }

    handleRecognitionError(event) {
        console.error('%c語音識別錯誤:', 'color: red; font-weight: bold', event.error);
        let message = '';
        
        switch (event.error) {
            case 'no-speech':
                message = '未檢測到語音，請說話';
                break;
            case 'audio-capture':
                message = '無法訪問麥克風';
                break;
            case 'not-allowed':
                message = '請允許使用麥克風';
                break;
            case 'network':
                message = '網絡連接出錯，請檢查網絡';
                break;
            case 'aborted':
                message = '語音識別被中斷';
                break;
            default:
                message = '語音識別錯誤: ' + event.error;
        }
        
        showNotification(message, 'error');
        
        // 如果是嚴重錯誤，停止語音識別
        if (['audio-capture', 'not-allowed', 'network'].includes(event.error)) {
            this.isListening = false;
            this.restartAttempts = this.maxRestartAttempts;
        }
    }

    // 開始語音識別
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
                    autoGainControl: true
                } 
            });
            stream.getTracks().forEach(track => track.stop());
            
            console.log('%c開始聆聽...', 'color: green; font-weight: bold');
            this.isListening = true;
            this.lastProcessedText = '';
            this.restartAttempts = 0;
            await this.recognition.start();
            
        } catch (error) {
            console.error('%c啟動語音識別失敗:', 'color: red; font-weight: bold', error);
            this.handleRecognitionError(error);
        }
    }

    // 停止語音識別
    stopListening() {
        if (this.recognition) {
            console.log('%c停止聆聽', 'color: orange; font-weight: bold');
            this.isListening = false;
            this.restartAttempts = this.maxRestartAttempts;
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('停止語音識別時出錯:', error);
            }
            this.lastProcessedText = '';
            if (this.processingTimeout) {
                clearTimeout(this.processingTimeout);
            }
        }
    }

    // 處理識別到的指令
    async processCommand(text) {
        if (!text || text.length < 2) {
            console.log('指令太短，忽略');
            return;
        }

        try {
            console.log('%c處理指令:', 'color: blue; font-weight: bold', text);
            console.group('指令處理詳情');
            
            const response = await fetch('/process-command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ command: text })
            });

            if (!response.ok) {
                throw new Error('處理指令失敗');
            }

            const data = await response.json();
            console.log('%c服務器回應:', 'color: purple', data);
            
            if (data.match) {
                console.log('%c找到匹配指令:', 'color: green', data.command);
                
                const wasListening = this.isListening;
                if (wasListening) {
                    this.stopListening();
                }

                showNotification(`執行指令: ${data.command}`, 'success');
                
                if (data.audio) {
                    try {
                        console.log('%c開始播放音頻:', 'color: blue', data.audio);
                        await this.playAudio('/uploads/' + data.audio);
                        console.log('%c音頻播放完成', 'color: green');
                        
                        if (wasListening) {
                            console.log('%c恢復語音識別', 'color: blue');
                            setTimeout(() => {
                                this.startListening();
                            }, 1000);
                        }
                    } catch (error) {
                        console.error('%c音頻播放失敗:', 'color: red', error);
                        showNotification('音頻播放失敗', 'error');
                        if (wasListening) {
                            setTimeout(() => {
                                this.startListening();
                            }, 1000);
                        }
                    }
                }
            } else {
                console.log('%c未找到匹配指令', 'color: orange');
                showNotification('未找到匹配的指令', 'info');
            }
            
            console.groupEnd();
        } catch (error) {
            console.error('%c處理指令失敗:', 'color: red', error);
            showNotification('處理指令失敗: ' + error.message, 'error');
            console.groupEnd();
        }
    }

    // 播放音頻
    async playAudio(audioUrl) {
        try {
            await this.wavesurfer.load(audioUrl);
            this.wavesurfer.play();

            return new Promise((resolve) => {
                this.wavesurfer.once('finish', resolve);
            });
        } catch (error) {
            console.error('播放音頻時出錯:', error);
            throw error;
        }
    }
}

// 顯示通知的輔助函數
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = 'notification ' + type;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}
