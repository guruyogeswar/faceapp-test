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
    get_user_by_email,
    add_album,
    grant_album_access,
    create_or_get_google_user,
    get_accessible_albums_for_user,
    get_albums_for_photographer,
    update_user_reference_photo,
    update_user_password,
    init_db,
    delete_album,
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
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg', 'gif', 'heic'}


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


@app.route('/api/profile/photo', methods=['POST'])
def update_profile_photo():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
    except Exception as exc:
        return jsonify({"error": "Authentication required", "details": str(exc)}), 401

    if 'avatar' not in request.files:
        return jsonify({"error": "No photo uploaded."}), 400

    avatar_file = request.files['avatar']
    if not avatar_file or avatar_file.filename == '':
        return jsonify({"error": "No photo selected."}), 400

    if not allowed_file(avatar_file.filename):
        return jsonify({"error": "Unsupported file type."}), 400

    max_bytes = 3 * 1024 * 1024
    file_size = avatar_file.content_length
    if file_size is None:
        try:
            avatar_file.stream.seek(0, os.SEEK_END)
            file_size = avatar_file.stream.tell()
            avatar_file.stream.seek(0)
        except Exception:
            file_size = None
    if file_size is None:
        content_length = request.content_length
        if content_length and content_length > max_bytes:
            file_size = content_length
    if file_size and file_size > max_bytes:
        return jsonify({"error": "File too large. Max size is 3 MB."}), 400

    filename = secure_filename(avatar_file.filename)
    unique_name = f"{uuid.uuid4()}_{filename}"
    local_path = os.path.join(UPLOAD_FOLDER, unique_name)
    avatar_file.save(local_path)

    r2_path = f"user_profiles/{username}/{unique_name}"
    upload_success, public_url = upload_to_r2(local_path, r2_path)

    try:
        os.remove(local_path)
    except OSError:
        pass

    if not upload_success or not public_url:
        return jsonify({"error": "Could not upload photo."}), 500

    user = get_user(username)
    previous_path = user.ref_photo_path if user else None

    if not update_user_reference_photo(username, r2_path):
        delete_from_r2(r2_path)
        return jsonify({"error": "User not found."}), 404

    if previous_path and previous_path != r2_path:
        delete_from_r2(previous_path)

    return jsonify({
        "message": "Profile photo updated.",
        "photo_url": public_url
    })


@app.route('/api/profile/password', methods=['POST'])
def update_profile_password():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
    except Exception as exc:
        return jsonify({"error": "Authentication required", "details": str(exc)}), 401

    data = request.get_json(silent=True) or {}
    current_password = (data.get('currentPassword') or '').strip()
    new_password = (data.get('newPassword') or '').strip()

    if not new_password or len(new_password) < 8:
        return jsonify({"error": "New password must be at least 8 characters."}), 400

    user = get_user(username)
    if not user:
        return jsonify({"error": "User not found."}), 404

    stored_password = user.password or ''
    if stored_password and stored_password != current_password:
        return jsonify({"error": "Current password is incorrect."}), 400

    if stored_password == new_password:
        return jsonify({"error": "New password must be different."}), 400

    if not update_user_password(username, new_password):
        return jsonify({"error": "Unable to update password."}), 500

    return jsonify({"message": "Password updated successfully."})

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

    print(
        "grant_access_endpoint:",
        {
            "attendee": attendee_username,
            "photographer": photographer,
            "album": album_id,
            "granted": granted,
            "message": message,
        },
        flush=True,
    )

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
        if message == "Album ID already exists for this photographer.":
            # Check for "Zombie" state: Exists in DB but not in R2 (or empty in R2)
            # This happens if a user deleted an album before the DB-deletion fix was applied.
            prefix = f"event_albums/{username}/{album_id}/"
            # distinct check: verify if there are any actual photos or if it's truly empty/gone
            existing_files = list_objects(prefix, limit=2)
            # Filter out placeholder if it's the only thing (though usually deletion removes it too)
            actual_files = [f for f in existing_files if not f.endswith('.placeholder') and not f.endswith('/')]
            
            if not actual_files:
                print(f"Detected zombie album '{album_id}' for {username}. Cleaning up DB and retrying creation.", flush=True)
                delete_album(username, album_id)
                # Retry creation
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
        # If R2 fails, we should rollback the DB entry to avoid creating a new zombie
        delete_album(username, album_id) 
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
            # Call ML API to generate face embeddings for this photo
            try:
                embedding_file_name = f"{username}-{album_id}_embeddings.json"
                ml_response = requests.post(
                    f"{ML_API_BASE_URL}add_embeddings_from_urls/",
                    data={
                        "urls": [public_url],
                        "embedding_file": embedding_file_name
                    },
                    timeout=120
                )
                if ml_response.status_code == 200:
                    ml_data = ml_response.json()
                    print(f"Embeddings generated: {ml_data.get('added_count', 0)} faces added for {original_filename}")
                else:
                    print(f"Warning: ML API returned {ml_response.status_code} for {original_filename}")
            except requests.exceptions.RequestException as e:
                print(f"Warning: Could not generate embeddings for {original_filename}: {e}")
            
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
        
        if payload.get('role') in ('attendee', 'vip_attendee'):
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

@app.route('/api/albums/batch', methods=['DELETE'])
def delete_albums_batch():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
        if payload.get('role') != 'photographer':
            return jsonify({"error": "Only photographers can delete albums."}), 403
    except Exception as e:
        return jsonify({"error": "Authentication failed", "details": str(e)}), 401

    data = request.get_json()
    album_ids = data.get('album_ids', [])
    if not album_ids:
        return jsonify({"error": "No album IDs provided."}), 400

    deleted_count = 0
    errors = []

    for album_id in album_ids:
        try:
            # 1. List all files in the album
            prefix = f"event_albums/{username}/{album_id}/"
            all_files = list_objects(prefix)
            
            # 2. Delete all files from R2
            for file_key in all_files:
                delete_from_r2(file_key)
            
            # 3. Remove from database
            delete_album(username, album_id)
            
            # 4. Remove embedding file from R2 (if it exists separately, though usually in embeddings folder)
            embedding_file = f"user_profiles/{username}/{username}-{album_id}_embeddings.json" # Potential location check
            # Since embeddings are managed by ML API and stored in R2 bucket root or specific path,
            # we might leave them or try to clean up if we knew the path. 
            # Current ML API logic stores them in root with format: {username}-{album_id}_embeddings.json
            embedding_filename = f"{username}-{album_id}_embeddings.json"
            delete_from_r2(embedding_filename)

            deleted_count += 1
        except Exception as e:
            errors.append(f"Failed to delete {album_id}: {str(e)}")

    return jsonify({
        "message": f"Deleted {deleted_count} albums.",
        "errors": errors
    })


@app.route('/api/albums/<album_id>/photos/batch', methods=['DELETE'])
def delete_photos_batch(album_id):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
        if payload.get('role') != 'photographer':
            return jsonify({"error": "Only photographers can delete photos."}), 403
    except Exception as e:
        return jsonify({"error": "Authentication failed", "details": str(e)}), 401

    data = request.get_json()
    photo_ids = data.get('photo_ids', [])
    if not photo_ids:
        return jsonify({"error": "No photo IDs provided."}), 400

    deleted_urls = []
    errors = []

    # 1. Delete from R2
    for photo_id in photo_ids:
        r2_path = f"event_albums/{username}/{album_id}/{photo_id}"
        success, error = delete_from_r2(r2_path)
        if success:
            deleted_urls.append(get_object_url(r2_path))
        else:
            errors.append(f"Failed to delete {photo_id}: {error}")

    # 2. Call ML API to remove embeddings
    if deleted_urls:
        try:
            embedding_file_name = f"{username}-{album_id}_embeddings.json"
            requests.post(
                f"{ML_API_BASE_URL}remove_embedding/",
                data={
                    "embedding_file": embedding_file_name,
                    "image_urls": json.dumps(deleted_urls)
                },
                timeout=30
            )
        except Exception as e:
            print(f"Warning: Failed to remove embeddings for deleted photos: {e}")
            # Don't fail the request if just embedding removal fails, but log it usually

    return jsonify({
        "message": f"Deleted {len(deleted_urls)} photos.",
        "errors": errors
    })


# --- VIP Registration (Simplified - No Password) ---

@app.route('/api/auth/vip-register', methods=['POST'])
def vip_register():
    """Register a VIP attendee with name, email, and face photo only (no password)."""
    if 'name' not in request.form or 'email' not in request.form:
        return jsonify({"error": "Name and email are required."}), 400
    if 'ref_photo' not in request.files:
        return jsonify({"error": "A face photo is required for registration."}), 400
    
    name = request.form['name'].strip()
    email = request.form['email'].strip().lower()
    ref_photo = request.files['ref_photo']
    
    if not name or not email:
        return jsonify({"error": "Name and email cannot be empty."}), 400
    
    if not allowed_file(ref_photo.filename):
        return jsonify({"error": "Invalid file type. Please upload an image."}), 400
    
    # Check if email already exists
    existing_user = get_user_by_email(email)
    if existing_user:
        return jsonify({"error": "This email is already registered. Please use the login option."}), 409
    
    # Auto-generate username from name
    base_username = name.lower().replace(' ', '_').replace('.', '')[:20]
    username = f"{base_username}_{uuid.uuid4().hex[:6]}"
    
    # Save reference photo (same flow as regular signup)
    filename = secure_filename(ref_photo.filename)
    unique_name = f"{uuid.uuid4()}_{filename}"
    local_path = os.path.join(UPLOAD_FOLDER, unique_name)
    ref_photo.save(local_path)
    
    r2_path = f"user_profiles/{username}/{unique_name}"
    upload_success, _public_url = upload_to_r2(local_path, r2_path)
    os.remove(local_path)
    
    if not upload_success:
        return jsonify({"error": "Could not save reference photo."}), 500
    
    # Create user with vip_attendee role (no password)
    success, message = add_user(
        username=username,
        password=None,
        role="vip_attendee",
        ref_photo_path=r2_path,
        email=email
    )
    
    if not success:
        delete_from_r2(r2_path)
        return jsonify({"error": message}), 409
    
    # Return token directly (no login step needed)
    token = create_token(username, role="vip_attendee")
    ref_photo_url = get_object_url(r2_path)
    
    return jsonify({
        "message": "Registration successful!",
        "token": token,
        "username": username,
        "role": "vip_attendee",
        "ref_photo_url": ref_photo_url
    }), 201


@app.route('/api/auth/vip-login', methods=['POST'])
def vip_login():
    """Auto-login for returning VIP users by email lookup."""
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    
    if not email:
        return jsonify({"error": "Email is required."}), 400
    
    user = get_user_by_email(email)
    
    if not user:
        return jsonify({"error": "Email not found. Please register first."}), 404
    
    if user.role not in ('vip_attendee', 'attendee'):
        return jsonify({"error": "Please use the regular login page."}), 403
    
    # Check if user has a reference photo
    if not user.ref_photo_path:
        return jsonify({
            "error": "Your registration is incomplete. Please upload a face photo.",
            "code": "missing_photo",
            "username": user.username
        }), 400
    
    # Generate token and return
    token = create_token(user.username, role=user.role)
    ref_photo_url = None
    if reference_photo_exists(user.ref_photo_path):
        ref_photo_url = get_object_url(user.ref_photo_path)
    
    return jsonify({
        "message": "Login successful!",
        "token": token,
        "username": user.username,
        "role": user.role,
        "ref_photo_url": ref_photo_url
    })


@app.route('/api/auth/vip-update-photo', methods=['POST'])
def vip_update_photo():
    """Allow VIP users to update their face photo if matching fails."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = verify_token(token)
        username = payload['sub']
    except Exception as e:
        return jsonify({"error": "Authentication required", "details": str(e)}), 401
    
    if 'ref_photo' not in request.files:
        return jsonify({"error": "A face photo is required."}), 400
    
    ref_photo = request.files['ref_photo']
    if not allowed_file(ref_photo.filename):
        return jsonify({"error": "Invalid file type."}), 400
    
    user = get_user(username)
    if not user:
        return jsonify({"error": "User not found."}), 404
    
    # Save new photo
    filename = secure_filename(ref_photo.filename)
    unique_name = f"{uuid.uuid4()}_{filename}"
    local_path = os.path.join(UPLOAD_FOLDER, unique_name)
    ref_photo.save(local_path)
    
    r2_path = f"user_profiles/{username}/{unique_name}"
    upload_success, public_url = upload_to_r2(local_path, r2_path)
    os.remove(local_path)
    
    if not upload_success:
        return jsonify({"error": "Could not upload photo."}), 500
    
    # Delete old photo if exists
    previous_path = user.ref_photo_path
    if not update_user_reference_photo(username, r2_path):
        delete_from_r2(r2_path)
        return jsonify({"error": "Could not update photo."}), 500
    
    if previous_path and previous_path != r2_path:
        delete_from_r2(previous_path)
    
    return jsonify({
        "message": "Face photo updated successfully.",
        "photo_url": public_url
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get("PORT", 8000)))