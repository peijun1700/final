from flask import Flask, render_template, send_from_directory, request, jsonify, url_for, session
import os
import json
import logging
from werkzeug.utils import secure_filename
import uuid

# 配置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = os.urandom(24)

# 設置靜態檔案目錄
app.static_folder = 'static'
app.static_url_path = '/static'
app.template_folder = 'templates'

# 基本配置
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max-limit

# 允許的音檔格式
ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma', 'aiff', 'alac', 'opus'}

def get_user_folder():
    if 'user_id' not in session:
        session['user_id'] = str(uuid.uuid4())
    user_folder = os.path.join(app.config['UPLOAD_FOLDER'], session['user_id'])
    if not os.path.exists(user_folder):
        os.makedirs(user_folder)
    return user_folder

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_AUDIO_EXTENSIONS

# 確保必要的目錄存在
def ensure_directories():
    directories = ['static', 'uploads', 'templates']
    for directory in directories:
        path = os.path.join(os.getcwd(), directory)
        if not os.path.exists(path):
            os.makedirs(path)

# 錯誤處理
@app.errorhandler(404)
def not_found_error(error):
    logger.error(f"404 error: {error}")
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"500 error: {error}")
    return jsonify({"error": "Internal server error"}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled exception: {str(e)}")
    return jsonify({"error": "Internal server error"}), 500

@app.route('/health')
def health_check():
    try:
        ensure_directories()
        return jsonify({"status": "healthy"}), 200
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

@app.route('/')
def index():
    try:
        ensure_directories()
        return render_template('index.html')
    except Exception as e:
        logger.error(f"Index route failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/get-settings')
def get_settings():
    try:
        user_folder = get_user_folder()
        settings_file = os.path.join(user_folder, 'settings.json')
        if os.path.exists(settings_file):
            with open(settings_file, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        return jsonify({'name': '語音助理', 'avatar': 'default-avatar.png'})
    except Exception as e:
        logger.error(f"Get settings failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/get-commands')
def get_commands():
    try:
        user_folder = get_user_folder()
        commands_file = os.path.join(user_folder, 'commands.json')
        if os.path.exists(commands_file):
            with open(commands_file, 'r', encoding='utf-8') as f:
                commands = json.load(f)
                return jsonify(commands)
        return jsonify([])
    except Exception as e:
        logger.error(f"Get commands failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/add-command', methods=['POST'])
def add_command():
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file"}), 400
        
        audio_file = request.files['audio']
        text = request.form.get('text', '').strip()
        
        if not text:
            return jsonify({"error": "No command text"}), 400
        
        if not audio_file or not audio_file.filename:
            return jsonify({"error": "No audio file selected"}), 400
        
        if not allowed_file(audio_file.filename):
            return jsonify({"error": "Invalid audio format"}), 400
        
        user_folder = get_user_folder()
        filename = secure_filename(str(uuid.uuid4()) + '.' + audio_file.filename.rsplit('.', 1)[1].lower())
        filepath = os.path.join(user_folder, filename)
        
        audio_file.save(filepath)
        
        commands_file = os.path.join(user_folder, 'commands.json')
        commands = []
        if os.path.exists(commands_file):
            with open(commands_file, 'r', encoding='utf-8') as f:
                commands = json.load(f)
        
        commands.append({
            'text': text,
            'audio': filename
        })
        
        with open(commands_file, 'w', encoding='utf-8') as f:
            json.dump(commands, f, ensure_ascii=False)
        
        return jsonify({"message": "Command added successfully"})
    except Exception as e:
        logger.error(f"Add command failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/process-command', methods=['POST'])
def process_command():
    try:
        data = request.get_json()
        if not data or 'command' not in data:
            return jsonify({"error": "No command text"}), 400
        
        command = data['command'].lower().strip()
        user_folder = get_user_folder()
        commands_file = os.path.join(user_folder, 'commands.json')
        
        if not os.path.exists(commands_file):
            return jsonify({"match": False, "message": "No commands available"})
        
        with open(commands_file, 'r', encoding='utf-8') as f:
            commands = json.load(f)
        
        for cmd in commands:
            if cmd['text'].lower() in command or command in cmd['text'].lower():
                return jsonify({
                    "match": True,
                    "command": cmd['text'],
                    "audio": cmd['audio']
                })
        
        return jsonify({"match": False, "message": "No matching command found"})
    except Exception as e:
        logger.error(f"Process command failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    try:
        user_folder = get_user_folder()
        return send_from_directory(user_folder, filename)
    except Exception as e:
        logger.error(f"Get file failed: {str(e)}")
        return jsonify({"error": str(e)}), 404

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5003))
    app.run(host='0.0.0.0', port=port, debug=False)
else:
    # Gunicorn 使用
    ensure_directories()
    app.config['ENV'] = 'production'
    app.config['DEBUG'] = False
    application = app
