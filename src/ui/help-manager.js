import NotificationManager from './notification-manager.js';

/**
 * Help Manager module
 * Handles display of help information for users
 */
class HelpManager {
    /**
     * Show help notification for Steam ID
     */
    static showSteamIdHelp() {
        const helpHtml = `
            <div class="notification-main-text" style="color:#2d8cf0;font-weight:500;">
                🆔 How to Get Your SteamID64
            </div>
            <div style="margin:10px 0;text-align:left;">
                <div style="margin-bottom:15px;">
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        Option 1: Quick Link (Recommended)
                    </div>
                    <div style="margin-bottom:8px;">
                        <a href="steam://url/SteamIDMyProfile" class="privacy-link" target="_self" style="font-weight:600;text-decoration:underline;">Open your Steam profile in the Steam client.</a>
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        Your profile will open in the Steam client. Click on the URL in the address bar at the top of the Steam window - this automatically copies it to your clipboard. Then paste it into the <strong>SteamID64</strong> field below.
                    </div>
                    <div style="color:#bfc9d8;font-size:0.95em;margin-left:10px;">
                        • Fast and automatic<br>
                        • Works with any Steam profile URL format<br>
                        • The app converts URLs to SteamID64 automatically
                    </div>
                </div>
                
                <div>
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        Option 2: Manual Entry
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        If you already know your <strong>SteamID64</strong> (17-digit number), you can enter it directly.
                    </div>
                </div>
            </div>            
            <div class="note" style="color:#aaa;font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid #353a40;padding-top:10px;">
                Your SteamID64 used to identify your account in Steam Web API requests.
            </div>
        `;
        NotificationManager.showNotification(helpHtml, 'info');
    }

    /**
     * Show help notification for API Key
     */
    static showApiKeyHelp() {
        const helpHtml = `
            <div class="notification-main-text" style="color:#2d8cf0;font-weight:500;">
                🔑 How to Get Your Steam API Token or Key
            </div>
            <div style="margin:10px 0;text-align:left;">
                <div style="margin-bottom:15px;">
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        Option 1: Token (Recommended)
                    </div>
                    <div style="margin-bottom:8px;">
                        <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="privacy-link" target="_self" style="font-weight:600;text-decoration:underline;">Get your Steam Web API Token in the Steam client.</a>
                    </div>                    
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        On the opened page, press <strong>Ctrl+A</strong> (select all), then <strong>Ctrl+C</strong> (copy), and <strong>Ctrl+V</strong> to paste it into the Steam Web API Token / Key field.
                    </div>
                    <div style="color:#bfc9d8;font-size:0.95em;margin-left:10px;">
                        • The app will extract your token and SteamID automatically<br>
                        • Your friend list can stay private<br>
                        • A token is valid for about 24 hours
                    </div>
                </div>
                
                <div>
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        Option 2: API Key
                    </div>
                    <div style="margin-bottom:8px;">
                        <a href="steam://openurl/https://steamcommunity.com/dev/apikey" class="privacy-link" target="_self" style="font-weight:600;text-decoration:underline;">Get your Steam Web API Key in the Steam client.</a>
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        Register a new API key by entering <strong>localhost</strong> as your domain, accept the terms, and copy your key.
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        Click the <strong>SteamID64</strong> field label below to open your Steam profile, then copy your profile URL and paste it into the SteamID64 field.
                    </div>
                    <div style="color:#bfc9d8;font-size:0.95em;margin-left:10px;">
                        • You may need to confirm via Steam Guard or email<br>
                        • Set your friend list to public at least once for caching<br>
                        • Make it public again temporarily to update your friends list
                    </div>
                </div>
            </div>            
            <div class="note" style="color:#aaa;font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid #353a40;padding-top:10px;">
                Your credentials are stored locally only.<br>
                All requests are made only through the official Steam Web API.
            </div>
        `;
        NotificationManager.showNotification(helpHtml, 'info');
    }
}

export default HelpManager;
