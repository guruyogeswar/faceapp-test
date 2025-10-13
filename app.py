# app.py

import os
from flask import Flask, request, jsonify, send_from_directory, redirect, url_for, session
from flask_cors import CORS
from werkzeug.utils import secure_filename
import uuid
import requests
import traceback

from config import ML_API_BASE_URL
from r2_storage import upload_to_r2, list_objects, get_object_url, delete_from_r2
from db import (
    add_user,
    get_user,
    add_album,
    grant_album_access,
    create_or_get_google_user,
    get_accessible_albums_for_user,
    get_albums_for_photographer,
    update_user_reference_photo,
    init_db,
)
from auth import create_token, verify_token, authenticate_user

app = Flask(__name__, static_folder='frontend')
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "super-secret-key-for-flask-session")
CORS(app)

# Ensure database tables are created when the application starts.
init_db()

UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg', 'gif'}


def _local_reference_photo_path(ref_photo_path: str) -> str:
    """Return the local fallback path for a stored reference photo."""
    return os.path.join(UPLOAD_FOLDER, os.path.basename(ref_photo_path))


def reference_photo_exists(ref_photo_path: str) -> bool:
    """Check whether a reference photo is accessible either in R2 or locally."""
    if not ref_photo_path:
        return False

    ref_photo_url = get_object_url(ref_photo_path)
    try:
        head_response = requests.head(ref_photo_url, timeout=10)
        if head_response.status_code == 200:
            content_type = head_response.headers.get("Content-Type", "").lower()
            if "image" in content_type:
                return True
    except requests.exceptions.RequestException:
        # Swallow errors and fall back to local check below.
        pass

    local_path = _local_reference_photo_path(ref_photo_path)
    if os.path.exists(local_path):
        # Attempt to restore the missing asset back to R2 for future requests.
        upload_success, _ = upload_to_r2(local_path, ref_photo_path)
        if upload_success:
            return True
        print(f"Warning: Unable to restore reference photo '{ref_photo_path}' during availability check.")

    return False


def fetch_reference_photo_bytes(ref_photo_path: str):
    """Retrieve reference photo bytes, restoring from local storage if necessary."""
    if not ref_photo_path:
        return None, "Reference photo not found for user."

    ref_photo_url = get_object_url(ref_photo_path)
    try:
        response = requests.get(ref_photo_url, timeout=30)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "").lower()
        if "image" not in content_type:
            raise ValueError("Stored reference photo is not an image.")
        return response.content, None
    except (requests.exceptions.RequestException, ValueError) as exc:
        local_path = _local_reference_photo_path(ref_photo_path)
        if os.path.exists(local_path):
            with open(local_path, "rb") as file_handle:
                file_bytes = file_handle.read()

            # Try to re-upload so future requests can hit R2 successfully.
            upload_success, _ = upload_to_r2(local_path, ref_photo_path)
            if not upload_success:
                print(f"Warning: Unable to restore reference photo '{ref_photo_path}' to R2.")

            return file_bytes, None

        error_message = (
            "Reference photo could not be loaded. Please re-upload your reference photo."
        )
        if isinstance(exc, ValueError):
            error_message = str(exc)
        return None, error_message

# --- Google OAuth Placeholder Endpoints ---

@app.route('/api/auth/google/login')
def google_login():
    """
    (Placeholder) Initiates the Google OAuth 2.0 flow.
    In a real app, this would redirect to Google's consent screen.
    """
    return jsonify({"message": "This is a placeholder for Google login. In a real app, you'd be redirected to Google."})

@app.route('/api/auth/google/callback')
def google_callback():
    """
    (Placeholder) Handles the callback from Google after user consent.
    """
    google_id = "simulated_google_id_" + str(uuid.uuid4())
    email = "test.user.google@example.com"
    username = "google_user_" + str(uuid.uuid4())[:6]
    
    google_user, is_new = create_or_get_google_user(google_id, username, email)

    if is_new:
        temp_token = create_token(google_user.username, role='pending_photo')
        return redirect(f"/google_signup_finalize.html?temp_token={temp_token}")
    else:
        token = create_token(google_user.username, role=google_user.role)
        return jsonify({
            "message": "Logged in successfully!",
            "token": token,
            "username": google_user.username,
            "role": google_user.role,
        })


# --- Static File Serving & Routes ---
@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/google_signup_finalize.html')
def google_signup_finalize_page():
    return send_from_directory('frontend', 'google_signup_finalize.html')

@app.route('/event.html')
def event_page():
    return send_from_directory('frontend', 'event.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory('frontend', path)
    return send_from_directory('frontend', 'index.html')

# --- API Endpoints ---
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    user = authenticate_user(username, password)
    if user:
        token = create_token(user.username, role=user.role)
        ref_photo_url = None
        if user.ref_photo_path and reference_photo_exists(user.ref_photo_path):
            ref_photo_url = get_object_url(user.ref_photo_path)
        return jsonify({
            "token": token,
            "username": user.username,
            "role": user.role,
            "ref_photo_url": ref_photo_url
        })
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    if 'username' not in request.form or 'password' not in request.form:
        return jsonify({"error": "Username and password are required."}), 400
    if 'ref_photo' not in request.files:
        return jsonify({"error": "A reference photo is required for signup."}), 400
    
    username = request.form['username']
    password = request.form['password']
    ref_photo = request.files['ref_photo']
    
    if not (username and password and ref_photo and allowed_file(ref_photo.filename)):
        return jsonify({"error": "Invalid form data or file type."}), 400
        
    filename = secure_filename(ref_photo.filename)
    unique_name = f"{uuid.uuid4()}_{filename}"
    local_path = os.path.join(UPLOAD_FOLDER, unique_name)
    ref_photo.save(local_path)
    
    r2_path = f"user_profiles/{username}/{unique_name}"
    upload_success, _public_url = upload_to_r2(local_path, r2_path)
    os.remove(local_path)
    
    if not upload_success:
        return jsonify({"error": "Could not save reference photo."}), 500
        
    success, message = add_user(username, password, role="attendee", ref_photo_path=r2_path)
    
    if not success:
        delete_from_r2(r2_path)
        return jsonify({"error": message}), 409
        
    return jsonify({"message": "User registered successfully!"}), 201

@app.route('/api/auth/google/finalize', methods=['POST'])
def finalize_google_signup():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return jsonify({"error": "Missing temporary token."}), 401
        
    if 'ref_photo' not in request.files:
        return jsonify({"error": "A reference photo is required."}), 400

    try:
        payload = verify_token(token)
        if payload.get('role') != 'pending_photo':
            return jsonify({"error": "Invalid token for this action."}), 403
        username = payload['sub']
    except Exception as e:
        return jsonify({"valid": False, "error": str(e)}), 401

    ref_photo = request.files['ref_photo']
    filename = secure_filename(ref_photo.filename)
    unique_name = f"{uuid.uuid4()}_{filename}"
    local_path = os.path.join(UPLOAD_FOLDER, unique_name)
    ref_photo.save(local_path)
    
    r2_path = f"user_profiles/{username}/{unique_name}"
    upload_to_r2(local_path, r2_path)
    os.remove(local_path)
    
    if update_user_reference_photo(username, r2_path, role='attendee'):
        user = get_user(username)
        role = user.role if user else 'attendee'
        final_token = create_token(username, role=role)
        return jsonify({
            "message": "Signup complete!",
            "token": final_token,
            "username": username,
            "role": role
        }), 200
    else:
        return jsonify({"error": "User not found."}), 404


@app.route('/api/auth/verify', methods=['GET'])
def verify_auth_token():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
        user = get_user(username)
        ref_photo_url = None
        if user and user.ref_photo_path and reference_photo_exists(user.ref_photo_path):
            ref_photo_url = get_object_url(user.ref_photo_path)
        return jsonify({
            "valid": True,
            "username": username,
            "ref_photo_url": ref_photo_url,
            "role": user.role if user else 'attendee'
        })
    except Exception as e:
        return jsonify({"valid": False, "error": str(e)}), 401

@app.route('/api/album/<photographer_username>/<album_id>/share', methods=['GET'])
def get_shareable_link(photographer_username, album_id):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        verify_token(token)
    except Exception as e:
        return jsonify({"error": "Authentication required to generate share links.", "details": str(e)}), 401
    
    base_url = request.host_url.rstrip('/')
    vip_link = f"{base_url}/event.html?photographer={photographer_username}&album={album_id}&type=vip"
    full_access_link = f"{base_url}/event.html?photographer={photographer_username}&album={album_id}&type=full"
    
    return jsonify({
        "vip_link": vip_link,
        "full_access_link": full_access_link
    })

@app.route('/api/grant-access', methods=['POST'])
def grant_access_endpoint():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        attendee_username = payload['sub']
    except Exception as e:
        return jsonify({"error": "Authentication required", "details": str(e)}), 401
    
    data = request.get_json()
    photographer = data.get('photographer')
    album_id = data.get('album_id')
    
    if not (photographer and album_id):
        return jsonify({"error": "Photographer and Album ID are required."}), 400
        
    granted, message = grant_album_access(attendee_username, photographer, album_id)

    if granted:
        return jsonify({"message": message}), 200

    if message in {"Attendee not found.", "Album not found."}:
        return jsonify({"error": message}), 404

    return jsonify({"message": message}), 200


@app.route('/api/attendee/albums', methods=['GET'])
def get_attendee_albums():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        attendee_username = payload['sub']
    except Exception as e:
        return jsonify({"error": "Authentication required", "details": str(e)}), 401

    accessible_albums = get_accessible_albums_for_user(attendee_username)

    formatted_albums = []
    for album_metadata in accessible_albums:
        photographer = album_metadata.get("photographer")
        album_id = album_metadata.get("album_id")
        if not photographer or not album_id:
            continue

        prefix = f"event_albums/{photographer}/{album_id}/"
        all_files = list_objects(prefix)
        actual_photos = [obj for obj in all_files if not obj.endswith('/') and not obj.endswith('.placeholder')]

        album_name = album_metadata.get("name") or album_id.replace('-', ' ').title()
        cover_image_url = get_object_url(actual_photos[0]) if actual_photos else None

        formatted_albums.append({
            "id": album_id,
            "name": album_name,
            "photographer": photographer,
            "cover": cover_image_url,
            "photo_count": len(actual_photos)
        })

    return jsonify(formatted_albums)

@app.route('/api/create-album', methods=['POST'])
def create_album():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
        if payload.get('role') != 'photographer':
             return jsonify({"error": "Only photographers can create albums."}), 403
    except Exception as e:
        return jsonify({"error": "Authentication failed", "details": str(e)}), 401
    
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({"error": "Missing album name"}), 400
    
    album_display_name = data['name']
    album_id = secure_filename(album_display_name.lower().replace(' ', '-'))
    if not album_id: return jsonify({"error": "Invalid album name"}), 400
    
    created, message = add_album(username, album_id, album_display_name)
    if not created:
        status_code = 404 if message == "Photographer not found." else 409
        return jsonify({"error": message}), status_code
    
    r2_placeholder_path = f"event_albums/{username}/{album_id}/.placeholder"
    temp_placeholder_file = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4()}_.placeholder")
    with open(temp_placeholder_file, 'w') as f: f.write('')
    upload_success, _ = upload_to_r2(temp_placeholder_file, r2_placeholder_path)
    os.remove(temp_placeholder_file)
    
    if upload_success:
        return jsonify({"message": "Album created successfully", "album": {"id": album_id, "name": album_display_name}}), 201
    else:
        return jsonify({"error": "Failed to create album in storage"}), 500

@app.route('/api/upload-single-file', methods=['POST'])
def upload_single_file_route():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
        if payload.get('role') != 'photographer':
            return jsonify({"error": "Only photographers can upload photos."}), 403
    except Exception as e:
        return jsonify({"error": "Authentication failed", "details": str(e)}), 401
    
    if 'file' not in request.files: return jsonify({"error": "No file part"}), 400
    
    file_to_upload = request.files['file']
    album_id = request.form.get('album')
    if not album_id: return jsonify({"error": "Album ID is missing"}), 400

    if file_to_upload and allowed_file(file_to_upload.filename):
        original_filename = secure_filename(file_to_upload.filename)
        unique_name = f"{uuid.uuid4()}_{original_filename}"
        local_path = os.path.join(UPLOAD_FOLDER, unique_name)
        file_to_upload.save(local_path)
        
        r2_path = f"event_albums/{username}/{album_id}/{unique_name}"
        upload_success, public_url = upload_to_r2(local_path, r2_path)
        os.remove(local_path)
        
        if upload_success:
            return jsonify({"success": True, "name": original_filename, "url": public_url, "id": unique_name}), 200
        else:
            return jsonify({"success": False, "error": "Failed to upload to R2 storage."}), 500
    else:
        return jsonify({"success": False, "error": "File type not allowed or no file submitted."}), 400

@app.route('/api/albums', methods=['GET'])
def get_albums():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
        
        if payload.get('role') == 'attendee':
            return get_attendee_albums()

        prefix_to_search = f"event_albums/{username}/"
        album_prefixes = list_objects(prefix_to_search, delimiter="/")
        
        formatted_albums = []
        if album_prefixes:
            photographer_albums = {
                album["album_id"]: album
                for album in get_albums_for_photographer(username)
            }

            for album_prefix in album_prefixes:
                album_id = album_prefix.rstrip('/').split('/')[-1]
                if not album_id:
                    continue

                album_details = photographer_albums.get(album_id, {})
                album_name = album_details.get("name") or album_id.replace('-', ' ').title()

                all_files = list_objects(album_prefix)
                actual_photos = [obj for obj in all_files if not obj.endswith('/') and not obj.endswith('.placeholder')]
                photo_count = len(actual_photos)
                cover_image_url = get_object_url(actual_photos[0]) if actual_photos else None

                album_data = {
                    "id": album_id,
                    "name": album_name,
                    "cover": cover_image_url,
                    "photo_count": photo_count,
                }
                formatted_albums.append(album_data)
        
        return jsonify(formatted_albums)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Could not retrieve albums.", "details": str(e)}), 500

@app.route('/api/event/<photographer_username>/<album_id>', methods=['GET'])
def get_event_album_photos(photographer_username, album_id):
    # This endpoint is now public for the "Full Access" link.
    # No token verification is performed here.
    try:
        prefix = f"event_albums/{photographer_username}/{album_id}/"
        photo_keys = list_objects(prefix)
        photos = [{"id": key.split('/')[-1], "url": get_object_url(key), "name": key.split('/')[-1]} for key in photo_keys if not key.endswith('/') and not key.endswith('.placeholder')]
        return jsonify(photos)
    except Exception as e:
        return jsonify({"error": "Could not retrieve event photos.", "details": str(e)}), 500

@app.route('/api/find-my-photos/<photographer_username>/<album_id>', methods=['GET'])
def find_my_photos(photographer_username, album_id):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        attendee_username = payload['sub']
    except Exception as e:
        return jsonify({"error": "Authentication required.", "details": str(e)}), 401

    try:
        attendee = get_user(attendee_username)
        if not attendee or not attendee.ref_photo_path:
            return jsonify({"error": "Reference photo not found for user."}), 404

        ref_photo_bytes, fetch_error = fetch_reference_photo_bytes(attendee.ref_photo_path)
        if ref_photo_bytes is None:
            return jsonify({
                "error": fetch_error or "Reference photo missing. Please upload a new reference photo.",
                "code": "reference_photo_missing",
            }), 404
        
        embedding_file_name = f"{photographer_username}-{album_id}_embeddings.json"
        api_endpoint = f"{ML_API_BASE_URL}find_similar_faces/"
        
        files_payload = { "file": ("reference_image.jpg", ref_photo_bytes, "image/jpeg") }
        data_payload = { "embedding_file": embedding_file_name }
        
        ml_response = requests.post(api_endpoint, files=files_payload, data=data_payload, timeout=60)
        ml_response.raise_for_status()
        
        return jsonify(ml_response.json()), ml_response.status_code

    except requests.exceptions.RequestException as e:
        return jsonify({"error": "Failed to connect to ML service or download reference photo.", "details": str(e)}), 503
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "An internal error occurred while finding matches.", "details": str(e)}), 500

@app.route('/api/albums/<album_id>/photos', methods=['GET'])
def get_album_photos(album_id):
    """Get all photos from a specific album for the authenticated photographer"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
        
        # Only photographers can access this endpoint
        if payload.get('role') == 'attendee':
            return jsonify({"error": "Access denied. Photographers only."}), 403
        
        # Build the prefix for this album
        prefix = f"event_albums/{username}/{album_id}/"
        
        # Get all objects in the album
        photo_keys = list_objects(prefix)
        
        # Filter out directories and placeholder files, format the response
        photos = []
        for key in photo_keys:
            if not key.endswith('/') and not key.endswith('.placeholder'):
                photo_id = key.split('/')[-1]
                photo_url = get_object_url(key)
                photos.append({
                    "id": photo_id,
                    "url": photo_url,
                    "name": photo_id
                })
        
        return jsonify(photos)
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Authentication required or failed to fetch photos.", "details": str(e)}), 401

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get("PORT", 8000)))