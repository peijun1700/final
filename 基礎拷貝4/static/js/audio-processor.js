class AudioProcessor {
    constructor(wavesurfer) {
        this.wavesurfer = wavesurfer;
        this.isListening = false;
        this.recognition = null;
        this.lastProcessedText = '';
        this.processingTimeout = null;
        this.initSpeechRecognition();
    }

    // 初始化語音識別
    initSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'zh-TW';
            this.recognition.maxAlternatives = 3;

            this.recognition.onstart = () => {
                console.log('%c語音識別已啟動', 'color: green; font-weight: bold');
                showNotification('開始聆聽...', 'info');
            };

            this.recognition.onend = () => {
                console.log('%c語音識別已結束', 'color: orange; font-weight: bold');
                if (this.isListening) {
                    setTimeout(() => {
                        if (this.isListening) {
                            console.log('%c重新啟動語音識別', 'color: blue');
                            this.recognition.start();
                        }
                    }, 100);
                }
            };

            this.recognition.onresult = async (event) => {
                const result = event.results[event.results.length - 1];
                
                // 顯示所有候選結果
                if (result.isFinal) {
                    console.log('%c語音識別結果:', 'color: purple; font-weight: bold');
                    for (let i = 0; i < result.length; i++) {
                        console.log(`候選 ${i + 1}: ${result[i].transcript} (置信度: ${result[i].confidence.toFixed(4)})`);
                    }
                    
                    const text = result[0].transcript.trim().toLowerCase();
                    console.log('%c最終識別結果:', 'color: blue; font-weight: bold', text);
                    
                    if (text !== this.lastProcessedText) {
                        this.lastProcessedText = text;
                        showNotification('識別到: ' + text, 'info');
                        
                        if (this.processingTimeout) {
                            clearTimeout(this.processingTimeout);
                        }
                        
                        this.processingTimeout = setTimeout(async () => {
                            await this.processCommand(text);
                        }, 500);
                    }
                } else {
                    // 顯示臨時結果
                    const tempText = result[0].transcript;
                    console.log('%c臨時識別結果:', 'color: gray', tempText);
                }
            };

            this.recognition.onerror = (event) => {
                console.error('%c語音識別錯誤:', 'color: red; font-weight: bold', event.error);
                if (event.error === 'no-speech') {
                    showNotification('未檢測到語音，請說話', 'warning');
                } else if (event.error === 'audio-capture') {
                    showNotification('無法訪問麥克風', 'error');
                } else if (event.error === 'not-allowed') {
                    showNotification('請允許使用麥克風', 'error');
                } else {
                    showNotification('語音識別錯誤: ' + event.error, 'error');
                }
            };
        } else {
            console.error('%c瀏覽器不支援語音識別', 'color: red; font-weight: bold');
            showNotification('您的瀏覽器不支援語音識別', 'error');
        }
    }

    // 開始語音識別
    async startListening() {
        if (!this.recognition) {
            showNotification('語音識別不可用', 'error');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            
            console.log('%c開始聆聽...', 'color: green; font-weight: bold');
            this.isListening = true;
            this.lastProcessedText = '';
            await this.recognition.start();
            
        } catch (error) {
            console.error('%c啟動語音識別失敗:', 'color: red; font-weight: bold', error);
            if (error.name === 'NotAllowedError') {
                showNotification('請允許使用麥克風', 'error');
            } else {
                showNotification('無法啟動語音識別: ' + error.message, 'error');
            }
        }
    }

    // 停止語音識別
    stopListening() {
        if (this.recognition) {
            console.log('%c停止聆聽', 'color: orange; font-weight: bold');
            this.isListening = false;
            this.recognition.stop();
            this.lastProcessedText = '';
            if (this.processingTimeout) {
                clearTimeout(this.processingTimeout);
            }
        }
    }

    // 處理識別到的指令
    async processCommand(text) {
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
                            }, 500);
                        }
                    } catch (error) {
                        console.error('%c音頻播放失敗:', 'color: red', error);
                        showNotification('音頻播放失敗', 'error');
                        if (wasListening) {
                            setTimeout(() => {
                                this.startListening();
                            }, 500);
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
            console.error('%c播放音頻失敗:', 'color: red', error);
            showNotification('播放音頻失敗', 'error');
            throw error;
        }
    }
}

// 顯示通知的輔助函數
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';

        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }
}
