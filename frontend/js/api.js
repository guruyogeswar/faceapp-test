// api.js - API client for interacting with the backend
class APIClient {
    constructor() {
        this.baseURL = ''; // Empty since we're using relative URLs
        this.token = localStorage.getItem('authToken') || null;
    }

    // Set the authentication token
    setToken(token) {
        this.token = token;
        localStorage.setItem('authToken', token);
    }

    // Clear the authentication token
    clearToken() {
        this.token = null;
        localStorage.removeItem('authToken');
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.token;
    }

    // Helper method for headers
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (includeAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return headers;
    }

    // User authentication
    async login(username, password) {
        try {
            const response = await fetch(`${this.baseURL}/api/auth/login`, {
                method: 'POST',
                headers: this.getHeaders(false),
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            this.setToken(data.token);
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    // Verify token validity
    async verifyToken() {
        try {
            const response = await fetch(`${this.baseURL}/api/auth/verify`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            const data = await response.json();
            
            if (!response.ok) {
                this.clearToken();
                return false;
            }

            return data.valid;
        } catch (error) {
            console.error('Token verification error:', error);
            this.clearToken();
            return false;
        }
    }

    // Check album password
    async checkAlbumPassword(albumId, password) {
        try {
            const response = await fetch(`${this.baseURL}/api/check-password/${albumId}`, {
                method: 'POST',
                headers: this.getHeaders(false),
                body: JSON.stringify({ password })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Password verification failed');
            }

            return data;
        } catch (error) {
            console.error('Password check error:', error);
            throw error;
        }
    }

    // Get all albums
    async getAlbums() {
        try {
            const response = await fetch(`${this.baseURL}/api/albums`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch albums');
            }

            return data;
        } catch (error) {
            console.error('Get albums error:', error);
            throw error;
        }
    }

    // Get photos in an album
    async getAlbumPhotos(albumId) {
        try {
            const response = await fetch(`${this.baseURL}/api/albums/${albumId}/photos`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch album photos');
            }

            return data;
        } catch (error) {
            console.error('Get album photos error:', error);
            throw error;
        }
    }

    // Create a new album
    async createAlbum(name) {
        try {
            const response = await fetch(`${this.baseURL}/api/create-album`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ name })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to create album');
            }

            return data;
        } catch (error) {
            console.error('Create album error:', error);
            throw error;
        }
    }

    // Upload a file
    async uploadFile(file, albumId = 'default') {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('album', albumId);

            const headers = {};
            if (this.token) {
                headers['Authorization'] = `Bearer ${this.token}`;
            }

            const response = await fetch(`${this.baseURL}/api/upload`, {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            return data;
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }
}

// Create a global instance
const api = new APIClient();

// sendForm: builds a mailto: message and opens the user's mail client
function sendForm(event) {
    if (event && event.preventDefault) event.preventDefault();
    const form = document.getElementById('contactForm');
    if (!form) return false;
    const name = form.name ? form.name.value.trim() : '';
    const email = form.email ? form.email.value.trim() : '';
    const phone = form.phone ? form.phone.value.trim() : '';
    const city = form.city ? form.city.value.trim() : '';
    const topic = form.topic ? form.topic.value : '';
    const message = form.message ? form.message.value.trim() : '';
    // Use EmailJS to send email directly from the browser (no mail client required).
    // You must create an EmailJS account and configure a service + template.
    // Replace the placeholders below with your values.
    const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
    const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
    const EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';

    // Template params sent to EmailJS template. Configure template to use these variables.
    const templateParams = {
        to_email: 'aadhishreephotofilm@gmail.com',
        from_name: name,
        from_email: email,
        phone: phone,
        city: city,
        topic: topic,
        message: message,
    };

    // Initialize EmailJS (safe to call multiple times)
    try {
        if (window.emailjs && typeof window.emailjs.init === 'function') {
            window.emailjs.init(EMAILJS_PUBLIC_KEY);
        }
    } catch (e) {
        console.warn('EmailJS init failed', e);
    }

    const note = document.querySelector('.form-note');
    if (note) note.textContent = 'Sending message...';

    if (window.emailjs && typeof window.emailjs.send === 'function' && EMAILJS_SERVICE_ID !== 'YOUR_SERVICE_ID') {
        window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
            .then(function (response) {
                if (note) note.textContent = 'Message sent — thank you!';
                form.reset();
            }, function (err) {
                console.error('EmailJS error', err);
                if (note) note.innerHTML = 'Send failed. Please try again or <a href="mailto:aadhishreephotofilm@gmail.com">email us directly</a>.';
            });
    } else {
        // Fallback: if EmailJS not configured, provide a link that opens Gmail compose in a new tab
        const subject = `Website contact: ${name || email || 'New message'}`;
        const body = `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nCity: ${city}\nTopic: ${topic}\n\nMessage:\n${message}`;
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=aadhishreephotofilm@gmail.com&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        if (note) {
            note.innerHTML = 'Email sending not configured. <a id="openGmailLink" href="#">Click here to open Gmail compose</a>.';
            const a = document.getElementById('openGmailLink');
            if (a) a.addEventListener('click', function (ev) {
                ev.preventDefault();
                window.open(gmailUrl, '_blank');
            });
        } else {
            // If no note element, try opening Gmail compose in a new tab
            try { window.open(gmailUrl, '_blank'); } catch (e) { /* ignore */ }
        }
    }

    return false;
}