class ThemeManager {
    constructor() {
        this.themeSelector = document.getElementById('themeSelector');
        this.currentTheme = localStorage.getItem('theme') || 'default';
        this.themes = {
            default: {
                '--primary-color': '#4CAF50',
                '--secondary-color': '#45a049',
                '--background-color': '#f0f2f5',
                '--text-color': '#333',
                '--button-text-color': '#fff',
                '--card-background': '#fff',
                '--border-color': '#ddd'
            },
            dark: {
                '--primary-color': '#2196F3',
                '--secondary-color': '#1976D2',
                '--background-color': '#1a1a1a',
                '--text-color': '#fff',
                '--button-text-color': '#fff',
                '--card-background': '#2d2d2d',
                '--border-color': '#404040'
            },
            warm: {
                '--primary-color': '#FF5722',
                '--secondary-color': '#F4511E',
                '--background-color': '#FFF3E0',
                '--text-color': '#5D4037',
                '--button-text-color': '#fff',
                '--card-background': '#FFECB3',
                '--border-color': '#FFE0B2'
            },
            ocean: {
                '--primary-color': '#00BCD4',
                '--secondary-color': '#0097A7',
                '--background-color': '#E0F7FA',
                '--text-color': '#006064',
                '--button-text-color': '#fff',
                '--card-background': '#B2EBF2',
                '--border-color': '#80DEEA'
            },
            forest: {
                '--primary-color': '#4CAF50',
                '--secondary-color': '#388E3C',
                '--background-color': '#E8F5E9',
                '--text-color': '#1B5E20',
                '--button-text-color': '#fff',
                '--card-background': '#C8E6C9',
                '--border-color': '#A5D6A7'
            }
        };
        
        this.init();
    }

    init() {
        // 設置初始主題
        this.applyTheme(this.currentTheme);
        
        // 設置選擇器的初始值
        if (this.themeSelector) {
            this.themeSelector.value = this.currentTheme;
            
            // 添加事件監聽器
            this.themeSelector.addEventListener('change', (e) => {
                const selectedTheme = e.target.value;
                this.applyTheme(selectedTheme);
                localStorage.setItem('theme', selectedTheme);
            });
        }
    }

    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (!theme) return;

        Object.entries(theme).forEach(([property, value]) => {
            document.documentElement.style.setProperty(property, value);
        });
    }
}
