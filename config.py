import os

# config.py

# Cloudflare R2 Configuration
R2_CONFIG = {
    "endpoint_url": "https://d77faf28a1998fdf6570b068d634e752.r2.cloudflarestorage.com",
    "bucket_name": "aadhishree",
    "public_base_url": "https://pub-6180e377c2f14a43a3176359c6bb99be.r2.dev",
    "aws_access_key_id": "80a73a52e450366c3a7ff125169d33e5",
    "aws_secret_access_key": "fa1e5a21ddfd0cee7f9bd7d818bedff884a9af7f50c5e005423685d7eeaa6865",
}

# JWT Secret Key
JWT_SECRET = "pixelperfect-secure-albums-secret-key-2023"

# ML API Base URL
ML_API_BASE_URL = "https://face-recognition-ml-912427501420.us-central1.run.app/" 

# Google OAuth Configuration (Replace with your actual credentials)
GOOGLE_CLIENT_ID     = '200111791636-5ulrqjctdclgd58e5csi745svcaitt8m.apps.googleusercontent.com'
GOOGLE_CLIENT_SECRET = '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'

REDIRECT_URI = "https://gravience.com/oauth2/callback" 