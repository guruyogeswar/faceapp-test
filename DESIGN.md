# FaceApp Test - Design Document

## Overview
Photo sharing application with face recognition for event photographers. Attendees find their photos by uploading a reference face photo.

## Architecture

### Backend (Flask)
- **app.py**: Main Flask application with all API endpoints
- **auth.py**: JWT token creation/verification
- **db.py**: SQLAlchemy database operations
- **models.py**: User and Album models
- **r2_storage.py**: Cloudflare R2 storage integration
- **config.py**: Environment configuration

### Frontend
- **index.html**: Landing page
- **albums.html**: Role-based page (admin for photographers, shared albums for users)
- **event.html**: VIP album viewer (face recognition photo matching)
- **vip_signup.html**: Simplified VIP registration (name, email, face photo - no password)
- **login.html / signin.html**: Regular auth (for photographers)

## User Roles
- `photographer`: Can create/manage albums, upload photos, share links
- `attendee`: Regular attendee with password-based login
- `vip_attendee`: Simplified registration (no password), email-only login

## VIP Registration Flow (NEW)
1. User receives VIP share link → event.html
2. If not authenticated → redirected to vip_signup.html
3. User provides: Name, Email, Face Photo
4. Backend creates user with `vip_attendee` role, returns token immediately
5. User redirected back to event.html to view matched photos
6. Returning users can login with email only

## Key Endpoints

### VIP Auth (No Password)
- `POST /api/auth/vip-register`: Register with name, email, face photo
- `POST /api/auth/vip-login`: Login by email only (for vip_attendee users)
- `POST /api/auth/vip-update-photo`: Update face photo if matching fails

### Regular Auth (Photographers Only)
- `POST /api/auth/login`: Username/password login
- `POST /api/auth/signup`: Full registration with password
- **Access via**: `/login.html` directly (not linked from main nav)

### Albums
- `GET /api/albums`: Get user's albums (photographer's own or attendee's shared)
- `POST /api/create-album`: Create new album (photographers only)
- `GET /api/find-my-photos/<photographer>/<album>`: Face recognition matching

## Navigation Flow
- Main nav (Log In / Sign Up) → `vip_signup.html` (simplified VIP flow)
- Photographers access admin via:
  - `/login.html` - direct password login
  - `/admin.html` - redirects to login.html
- Albums page shows role-based content:
  - **Photographers**: Album management (create, upload, share)
  - **VIP Users**: Albums shared with them

## Important: R2 Storage vs SQLite Database
Albums must exist in **both** R2 storage AND SQLite database for VIP access to work:
- R2 stores the actual photos
- SQLite stores album metadata and user access permissions
- If albums exist in R2 but not in DB, run manual SQL INSERT to sync them

## Deployment
### ML Service (Cloud Run)
- **Service Name**: `face-recognition-ml`
- **URL**: `https://face-recognition-ml-5tvmlyr7ia-uc.a.run.app`
- **Region**: `us-central1`
- **Resources**: 2 CPUs, 2Gi Memory
- **Code**: `docker/` folder (FastAPI)
