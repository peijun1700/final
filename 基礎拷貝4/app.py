# -*- coding: utf-8 -*-

from flask import Flask, request, jsonify, send_from_directory, render_template
import os
import json
from werkzeug.utils import secure_filename
import uuid

app = Flask(__name__, template_folder='templates', static_folder='static', static_url_path='/static')

# 確保必要的目錄存在
UPLOAD_FOLDER = 'uploads'
STATIC_IMAGES = 'static/images'
STATIC_JS = 'static/js'
STATIC_CSS = 'static/css'

for directory in [UPLOAD_FOLDER, STATIC_IMAGES, STATIC_JS, STATIC_CSS]:
    if not os.path.exists(directory):
        os.makedirs(directory)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max-limit

# 確保命令和設定檔案存在
COMMANDS_FILE = 'commands.json'
SETTINGS_FILE = 'settings.json'

if not os.path.exists(COMMANDS_FILE):
    with open(COMMANDS_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f)

if not os.path.exists(SETTINGS_FILE):
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump({'name': '語音助理', 'avatar': 'default-avatar.png'}, f, ensure_ascii=False)

# 允許的音檔格式
ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma', 'aiff', 'alac', 'opus'}
# 允許的圖片格式
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename, allowed_extensions):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions

def load_commands():
    try:
        with open(COMMANDS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return []

def save_commands(commands):
    with open(COMMANDS_FILE, 'w', encoding='utf-8') as f:
        json.dump(commands, f, ensure_ascii=False)

def load_settings():
    try:
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {'name': '語音助理', 'avatar': 'default-avatar.png'}

def save_settings(settings):
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/add-command', methods=['POST'])
def add_command():
    print("Received add-command request")  # 添加調試信息
    
    if 'audio' not in request.files:
        print("No audio file in request")  # 添加調試信息
        return jsonify({'error': '沒有音檔'}), 400
    
    audio_file = request.files['audio']
    text = request.form.get('text', '').strip()
    
    print(f"Command text: {text}")  # 添加調試信息
    print(f"Audio filename: {audio_file.filename}")  # 添加調試信息
    
    if not text:
        return jsonify({'error': '沒有指令文字'}), 400
    
    if not audio_file or not audio_file.filename:
        return jsonify({'error': '沒有選擇音檔'}), 400
    
    if not allowed_file(audio_file.filename, ALLOWED_AUDIO_EXTENSIONS):
        return jsonify({'error': '不支援的音檔格式'}), 400
    
    try:
        # 生成唯一的檔案名
        file_extension = audio_file.filename.rsplit('.', 1)[1].lower()
        filename = secure_filename(str(uuid.uuid4()) + '.' + file_extension)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        print(f"Saving audio file to: {file_path}")  # 添加調試信息
        
        # 確保上傳目錄存在
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        # 保存音頻文件
        audio_file.save(file_path)
        
        if not os.path.exists(file_path):
            return jsonify({'error': '音檔保存失敗'}), 500
        
        commands = load_commands()
        commands.append({
            'text': text,
            'audio': filename
        })
        save_commands(commands)
        
        print("Command added successfully")  # 添加調試信息
        return jsonify({'message': '指令新增成功', 'command': {'text': text, 'audio': filename}})
    
    except Exception as e:
        print(f"Error saving audio file: {str(e)}")  # 添加調試信息
        return jsonify({'error': f'音檔保存失敗: {str(e)}'}), 500

@app.route('/get-commands')
def get_commands():
    return jsonify(load_commands())

@app.route('/delete-command', methods=['POST'])
def delete_command():
    data = request.get_json()
    if 'text' not in data:
        return jsonify({'error': '缺少指令文字'}), 400
    
    commands = load_commands()
    text = data['text']
    for i, command in enumerate(commands):
        if command['text'] == text:
            command = commands.pop(i)
            # 刪除對應的音檔
            try:
                os.remove(os.path.join(app.config['UPLOAD_FOLDER'], command['audio']))
            except OSError:
                pass  # 如果檔案不存在就忽略
            save_commands(commands)
            return jsonify({'message': '指令已刪除'})
    
    return jsonify({'error': '找不到指令'}), 404

@app.route('/process-command', methods=['POST'])
def process_command():
    try:
        data = request.get_json()
        if not data or 'command' not in data:
            return jsonify({'error': '缺少指令文字'}), 400
            
        command = data.get('command', '').lower().strip()
        print(f"收到指令: {command}")  # 調試日誌
        
        # 載入已保存的命令
        commands = load_commands()
        print(f"已保存的命令: {commands}")  # 調試日誌
        
        # 尋找匹配的命令
        for saved_command in commands:
            saved_text = saved_command['text'].lower().strip()
            print(f"比較 '{command}' 與 '{saved_text}'")  # 調試日誌
            
            # 使用更寬鬆的匹配條件
            if command in saved_text or saved_text in command:
                print(f"找到匹配: {saved_command}")  # 調試日誌
                return jsonify({
                    'match': True,
                    'command': saved_command['text'],
                    'audio': saved_command['audio']
                })
        
        print("未找到匹配的指令")  # 調試日誌
        return jsonify({
            'match': False,
            'message': '未找到匹配的指令'
        })
        
    except Exception as e:
        print(f"處理指令時發生錯誤: {str(e)}")  # 調試日誌
        return jsonify({'error': '處理指令時發生錯誤'}), 500

@app.route('/upload-avatar', methods=['POST'])
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'error': '沒有圖片檔'}), 400
    
    avatar_file = request.files['avatar']
    if not avatar_file or not avatar_file.filename:
        return jsonify({'error': '沒有選擇圖片'}), 400
    
    if not allowed_file(avatar_file.filename, ALLOWED_IMAGE_EXTENSIONS):
        return jsonify({'error': '不支援的圖片格式'}), 400
    
    try:
        # 生成唯一的檔案名
        file_extension = avatar_file.filename.rsplit('.', 1)[1].lower()
        filename = secure_filename('avatar_' + str(uuid.uuid4()) + '.' + file_extension)
        
        # 保存到 static/images 目錄
        avatar_path = os.path.join(STATIC_IMAGES, filename)
        avatar_file.save(avatar_path)
        
        # 更新設置
        settings = load_settings()
        
        # 刪除舊的頭像檔案（如果不是預設頭像）
        if settings.get('avatar') and settings['avatar'] != 'default-avatar.png':
            try:
                old_avatar_path = os.path.join(STATIC_IMAGES, settings['avatar'])
                if os.path.exists(old_avatar_path):
                    os.remove(old_avatar_path)
            except Exception as e:
                print(f"刪除舊頭像失敗: {str(e)}")
        
        # 更新設置
        settings['avatar'] = filename
        save_settings(settings)
        
        return jsonify({
            'message': '頭像上傳成功',
            'avatar_url': f'/static/images/{filename}'
        })
        
    except Exception as e:
        return jsonify({'error': f'上傳失敗: {str(e)}'}), 500

@app.route('/get-settings')
def get_settings():
    settings = load_settings()
    return jsonify({
        'name': settings.get('name', '語音助理'),
        'avatar': settings.get('avatar', 'default-avatar.png')
    })

@app.route('/save-bot-settings', methods=['POST'])
def save_bot_settings():
    data = request.get_json()
    if not data:
        return jsonify({'error': '沒有資料'}), 400
    
    settings = load_settings()
    if 'name' in data:
        settings['name'] = data['name']
    save_settings(settings)
    
    return jsonify(settings)

if __name__ == '__main__':
    app.run(port=5003, debug=True)
