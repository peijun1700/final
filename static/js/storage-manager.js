class StorageManager {
    static async getCommands() {
        try {
            const response = await fetch('/get-commands');
            if (!response.ok) {
                throw new Error('Failed to fetch commands');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching commands:', error);
            return [];
        }
    }

    static async getSettings() {
        try {
            const response = await fetch('/get-settings');
            if (!response.ok) {
                throw new Error('Failed to fetch settings');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching settings:', error);
            return {
                name: '語音助手',
                avatar: 'default-avatar.png'
            };
        }
    }

    static async saveSettings(settings) {
        try {
            const response = await fetch('/save-bot-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save settings');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error saving settings:', error);
            throw error;
        }
    }
}
