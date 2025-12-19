import os

# config.py

# Cloudflare R2 Configuration
R2_CONFIG = {
    "endpoint_url": "https://7f6e79e9b8402a59fa23c2576cfa5195.r2.cloudflarestorage.com",
    "bucket_name": "testing-storage",
    "public_base_url": "https://pub-3b6ed244985a49a1b3add562e2f00617.r2.dev",
    "aws_access_key_id": "6c251710b7d1334023b3ad08588b2fd1",
    "aws_secret_access_key": "64aa1855f26617884501faff4e56d5ca527b1bbdabb2d2db6cc0506a686964fe",
}

# JWT Secret Key
JWT_SECRET = "pixelperfect-secure-albums-secret-key-2023"

# ML API Base URL
ML_API_BASE_URL = "http://localhost:8080/" 

# Google OAuth Configuration (Replace with your actual credentials)
GOOGLE_CLIENT_ID     = '200111791636-5ulrqjctdclgd58e5csi745svcaitt8m.apps.googleusercontent.com'
GOOGLE_CLIENT_SECRET = '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'

REDIRECT_URI = "https://gravience.com/oauth2/callback" 