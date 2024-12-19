from flask import Flask, render_template, send_from_directory, request, jsonify, url_for, session
import os
import json
from pathlib import Path
import speech_recognition as sr
import pygame
import threading
import time
from werkzeug.utils import secure_filename
import uuid
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.urandom(24)  # 添加secret key用於session

# 設置靜態檔案目錄
app.static_folder = 'static'
app.static_url_path = '/static'
app.template_folder = 'templates'

# 確保上傳目錄存在
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

ALLOWED_EXTENSIONS = {
    # 音檔格式
    'mp3',  # MPEG Layer-3
    'wav',  # Waveform Audio File Format
    'ogg',  # Ogg Vorbis
    'aac',  # Advanced Audio Coding
    'm4a',  # MPEG-4 Audio
    'flac', # Free Lossless Audio Codec
    'wma',  # Windows Media Audio
    'aiff', # Audio Interchange File Format
    'alac', # Apple Lossless Audio Codec
    'opus'  # Opus Interactive Audio Codec
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_file(file):
    if not file:
        return False, '沒有選擇檔案'
        
    if file.filename == '':
        return False, '無效的檔案名稱'
        
    if not allowed_file(file.filename):
        return False, f'不支援的檔案類型。支援的格式：{", ".join(ALLOWED_EXTENSIONS)}'
        
    if len(file.read()) > 50 * 1024 * 1024:  # 50MB
        return False, '檔案大小不能超過 50MB'
        
    file.seek(0)  # 重置文件指針
    return True, ''

def get_user_folder():
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
    user_folder = os.path.join(UPLOAD_FOLDER, session['user_id'])
    if not os.path.exists(user_folder):
        os.makedirs(user_folder)
    return user_folder

class VoiceAssistant:
    def __init__(self):
        pygame.mixer.init()
        self.recognizer = sr.Recognizer()
        self.is_listening = False
        self.commands = {}
        self.load_commands()

    def load_commands(self):
        user_folder = get_user_folder()
        commands_file = os.path.join(user_folder, 'commands.json')
        if os.path.exists(commands_file):
            with open(commands_file, 'r', encoding='utf-8') as f:
                self.commands = json.load(f)

    def save_commands(self):
        user_folder = get_user_folder()
        commands_file = os.path.join(user_folder, 'commands.json')
        with open(commands_file, 'w', encoding='utf-8') as f:
            json.dump(self.commands, f, ensure_ascii=False, indent=2)

    def process_command(self, command_text):
        command_text = command_text.lower()
        for cmd in self.commands:
            if cmd['text'].lower() in command_text:
                return cmd
        return None

assistant = VoiceAssistant()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload-avatar', methods=['POST'])
def upload_avatar():
    try:
        if 'avatar' not in request.files:
            return jsonify({'error': '未上傳圖片'}), 400
            
        file = request.files['avatar']
        if not file:
            return jsonify({'error': '文件無效'}), 400
            
        # 檢查文件類型
        if not file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif')):
            return jsonify({'error': '不支持的文件類型'}), 400
            
        # 創建頭貼目錄
        avatar_dir = os.path.join(app.static_folder, 'images')
        os.makedirs(avatar_dir, exist_ok=True)
        
        # 生成唯一的文件名
        filename = secure_filename(f"avatar_{int(time.time())}_{file.filename}")
        filepath = os.path.join(avatar_dir, filename)
        
        # 保存文件
        file.save(filepath)
        
        # 更新設定檔
        user_folder = get_user_folder()
        settings_file = os.path.join(user_folder, 'settings.json')
        settings = {}
        if os.path.exists(settings_file):
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
        
        avatar_url = url_for('static', filename=f'images/{filename}')
        settings['avatar_url'] = avatar_url
        
        with open(settings_file, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'success': True,
            'avatar_url': avatar_url
        })
        
    except Exception as e:
        print(f"上傳頭貼時發生錯誤: {str(e)}")
        return jsonify({'error': '上傳失敗'}), 500

@app.route('/get-avatar', methods=['GET'])
def get_avatar():
    try:
        # 讀取設定檔
        user_folder = get_user_folder()
        settings_file = os.path.join(user_folder, 'settings.json')
        if os.path.exists(settings_file):
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
        else:
            settings = {
                'avatar_url': url_for('static', filename='images/default-avatar.png')
            }
        return jsonify(settings)
    except Exception as e:
        print(f"獲取頭貼時發生錯誤: {str(e)}")
        return jsonify({'error': '獲取頭貼失敗'}), 500

@app.route('/update-name', methods=['POST'])
def update_name():
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': '缺少名字參數'}), 400
        
    new_name = data['name'].strip()
    if not new_name:
        return jsonify({'error': '名字不能為空'}), 400
        
    if len(new_name) > 20:
        return jsonify({'error': '名字不能超過20個字'}), 400
        
    try:
        # 保存名字到設定檔
        user_folder = get_user_folder()
        settings_file = os.path.join(user_folder, 'settings.json')
        settings = {}
        
        if os.path.exists(settings_file):
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                
        settings['bot_name'] = new_name
        
        with open(settings_file, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
            
        return jsonify({
            'success': True,
            'name': new_name
        })
    except Exception as e:
        print(f"Error updating name: {str(e)}")
        return jsonify({'error': '更新名字失敗'}), 500

@app.route('/get-settings', methods=['GET'])
def get_settings():
    try:
        # 讀取設定檔
        user_folder = get_user_folder()
        settings_file = os.path.join(user_folder, 'settings.json')
        if os.path.exists(settings_file):
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
        else:
            settings = {
                'bot_name': '語音助手',
                'avatar_url': url_for('static', filename='images/default-avatar.png')
            }
        return jsonify(settings)
    except Exception as e:
        print(f"獲取設定時發生錯誤: {str(e)}")
        return jsonify({'error': '獲取設定失敗'}), 500

@app.route('/upload-command', methods=['POST'])
def upload_command():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': '未上傳音頻文件'}), 400
            
        audio_file = request.files['audio']
        command_text = request.form.get('command')
        
        if not audio_file or not command_text:
            return jsonify({'error': '請提供音頻文件和指令文字'}), 400
            
        if not allowed_file(audio_file.filename):
            return jsonify({'error': '不支持的文件類型'}), 400
            
        # 生成唯一的文件名
        filename = secure_filename(audio_file.filename)
        file_extension = os.path.splitext(filename)[1]
        unique_filename = str(uuid.uuid4()) + file_extension
        
        # 保存音頻文件
        user_folder = get_user_folder()
        audio_path = os.path.join(user_folder, unique_filename)
        audio_file.save(audio_path)
        
        # 讀取現有的指令
        commands_file = os.path.join(user_folder, 'commands.json')
        commands = []
        if os.path.exists(commands_file):
            with open(commands_file, 'r', encoding='utf-8') as f:
                commands = json.load(f)
                
        # 添加新指令
        command_data = {
            'id': str(uuid.uuid4()),
            'text': command_text,
            'fileName': unique_filename,
            'timestamp': datetime.now().isoformat()
        }
        commands.append(command_data)
        
        # 保存更新後的指令列表
        with open(commands_file, 'w', encoding='utf-8') as f:
            json.dump(commands, f, ensure_ascii=False, indent=2)
            
        return jsonify({'success': True, 'command': command_data})
        
    except Exception as e:
        print(f"上傳指令時發生錯誤: {str(e)}")
        return jsonify({'error': '上傳失敗'}), 500

@app.route('/get-commands', methods=['GET'])
def get_commands():
    try:
        user_folder = get_user_folder()
        commands_file = os.path.join(user_folder, 'commands.json')
        if not os.path.exists(commands_file):
            return jsonify([])
            
        with open(commands_file, 'r', encoding='utf-8') as f:
            commands = json.load(f)
            
        # 確保每個指令都有完整的音頻URL
        for command in commands:
            if 'fileName' in command:
                command['audioUrl'] = f'/uploads/{session["user_id"]}/{command["fileName"]}'
                
        return jsonify(commands)
    except Exception as e:
        print(f"Error getting commands: {str(e)}")
        return jsonify({'error': '獲取指令列表失敗'}), 500

@app.route('/list-commands', methods=['GET'])
def list_commands():
    try:
        user_folder = get_user_folder()
        commands_file = os.path.join(user_folder, 'commands.json')
        if not os.path.exists(commands_file):
            return jsonify([])
            
        with open(commands_file, 'r', encoding='utf-8') as f:
            commands = json.load(f)
            
        return jsonify(commands)
        
    except Exception as e:
        print(f"獲取指令列表時發生錯誤: {str(e)}")
        return jsonify({'error': '獲取指令列表失敗'}), 500

@app.route('/delete-command/<command_id>', methods=['DELETE'])
def delete_command(command_id):
    try:
        user_folder = get_user_folder()
        commands_file = os.path.join(user_folder, 'commands.json')
        if not os.path.exists(commands_file):
            return jsonify({'error': '找不到指令文件'}), 404
            
        # 讀取指令列表
        with open(commands_file, 'r', encoding='utf-8') as f:
            commands = json.load(f)
            
        # 找到要刪除的指令
        command_to_delete = None
        for command in commands:
            if command['id'] == command_id:
                command_to_delete = command
                break
                
        if not command_to_delete:
            return jsonify({'error': '找不到指令'}), 404
            
        # 刪除音頻文件
        audio_path = os.path.join(user_folder, command_to_delete['fileName'])
        if os.path.exists(audio_path):
            os.remove(audio_path)
            
        # 從列表中移除指令
        commands.remove(command_to_delete)
        
        # 保存更新後的列表
        with open(commands_file, 'w', encoding='utf-8') as f:
            json.dump(commands, f, ensure_ascii=False, indent=2)
            
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"刪除指令時發生錯誤: {str(e)}")
        return jsonify({'error': '刪除失敗'}), 500

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    if '..' in filename or filename.startswith('/'):
        return jsonify({'error': '無效的檔案路徑'}), 400
        
    try:
        # 從 UPLOAD_FOLDER 目錄提供文件
        user_folder = get_user_folder()
        return send_from_directory(user_folder, filename)
    except Exception as e:
        print(f"Error serving file {filename}: {str(e)}")
        return jsonify({'error': '無法讀取檔案'}), 404

@app.route('/process-command', methods=['POST'])
def process_command():
    try:
        data = request.get_json()
        if not data or 'command' not in data:
            return jsonify({'error': '未提供指令'}), 400
            
        command_text = data['command'].strip().lower()
        
        # 讀取指令列表
        user_folder = get_user_folder()
        commands_file = os.path.join(user_folder, 'commands.json')
        if not os.path.exists(commands_file):
            return jsonify({'match': False, 'error': '沒有可用的指令'})
            
        with open(commands_file, 'r', encoding='utf-8') as f:
            commands = json.load(f)
            
        # 尋找匹配的指令
        for command in commands:
            if command['text'].lower() in command_text or command_text in command['text'].lower():
                return jsonify({
                    'match': True,
                    'command': command['text'],
                    'audio': command['fileName']
                })
                
        return jsonify({'match': False})
        
    except Exception as e:
        print(f"處理指令時發生錯誤: {str(e)}")
        return jsonify({'error': '處理指令失敗'}), 500

if __name__ == '__main__':
    # 本地開發使用
    port = int(os.environ.get('PORT', 5003))
    print(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
else:
    # Gunicorn 使用
    # 確保必要的目錄存在
    for directory in ['static', 'uploads', 'templates']:
        path = os.path.join(os.getcwd(), directory)
        if not os.path.exists(path):
            os.makedirs(path)
    
    # 設置生產環境配置
    app.config['ENV'] = 'production'
    app.config['DEBUG'] = False
    application = app
