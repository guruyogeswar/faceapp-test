document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration & State ---
    let currentlyDisplayedPhotos = [];
    let currentLightboxIndex = 0;
    let currentPhotographer = '';
    let currentAlbum = '';

    // --- DOM Elements ---
    const views = {
        loading: document.getElementById('view-loading'),
        guest: document.getElementById('view-guest'),
        gallery: document.getElementById('view-gallery'),
    };
    const loadingMessage = document.getElementById('loading-message');
    const loadingSubtext = document.getElementById('loading-subtext');
    const eventTitleGuest = document.getElementById('event-title-guest');
    const eventTitleMain = document.getElementById('event-title-main');
    const loginBtnGuest = document.getElementById('login-btn-guest');
    const signupBtnGuest = document.getElementById('signup-btn-guest');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const photosContainer = document.getElementById('photos-container');
    let loadingMessageInterval = null;

    // Lightbox Elements
    const lightboxModal = document.getElementById('lightbox-modal');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxCounter = document.getElementById('lightbox-counter');
    const lightboxDownload = document.getElementById('lightbox-download');
    const closeLightbox = document.getElementById('close-lightbox');
    const lightboxPrev = document.getElementById('lightbox-prev');
    const lightboxNext = document.getElementById('lightbox-next');

    // --- View Management ---
    const showView = (viewName) => {
        Object.values(views).forEach(view => view.classList.add('hidden'));
        if (views[viewName]) {
            views[viewName].classList.remove('hidden');
        }
    };

    const persistPendingAccess = (photographer, album) => {
        localStorage.setItem('pendingAccess_photographer', photographer);
        localStorage.setItem('pendingAccess_albumId', album);
    };

    const loadingMessages = {
        default: [
            'Loading event gallery...',
            'Almost ready. Setting the perfect lighting...',
            'Curating your memories...'
        ],
        vip: [
            'Hang tight! We are locating your photos...',
            'Matching faces with the event album...',
            'Bringing your best moments into focus...'
        ],
        full: [
            'Loading the full gallery...',
            'Fetching high-resolution photos...',
            'Arranging your album layout...'
        ]
    };

    const stopLoadingAnimation = () => {
        if (loadingMessageInterval) {
            clearInterval(loadingMessageInterval);
            loadingMessageInterval = null;
        }
    };

    const startLoadingAnimation = (mode = 'default') => {
        const sequence = loadingMessages[mode] || loadingMessages.default;
        let index = 0;

        stopLoadingAnimation();

        loadingMessage.classList.remove('text-red-500');
        loadingMessage.textContent = sequence[index];

        if (loadingSubtext) {
            loadingSubtext.textContent = 'You can keep this tab open while we prepare your gallery.';
            loadingSubtext.classList.remove('hidden');
        }

        loadingMessageInterval = setInterval(() => {
            index = (index + 1) % sequence.length;
            loadingMessage.textContent = sequence[index];
        }, 1500);

        showView('loading');
    };

    const ensureVipAccess = async (photographer, album, token) => {
        try {
            const response = await fetch('/api/grant-access', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ photographer, album_id: album })
            });
            // 200 or 409 style responses are acceptable; ignore errors silently.
            if (response.ok) {
                localStorage.removeItem('pendingAccess_photographer');
                localStorage.removeItem('pendingAccess_albumId');
            } else {
                try {
                    await response.json();
                } catch (_) {
                    /* swallow */
                }
            }
        } catch (error) {
            console.warn('Unable to grant VIP access automatically:', error);
        }
    };

    // --- NEW: Force Download Helper ---
    // This function fetches the image and uses a Blob to trigger a "Save As" dialog.
    const forceDownload = async (url, fileName) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const objectUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            window.URL.revokeObjectURL(objectUrl); // Clean up the object URL
        } catch (error) {
            console.error('Download failed for:', fileName, error);
            alert(`Could not download ${fileName}. Please check the console for errors.`);
        }
    };

    // --- Lightbox Functions ---
    const openLightbox = (photoIndex) => {
        if (!currentlyDisplayedPhotos.length) return;

        currentLightboxIndex = photoIndex;
        updateLightboxContent();
        lightboxModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    };

    const closeLightboxModal = () => {
        lightboxModal.classList.add('hidden');
        document.body.style.overflow = ''; // Restore scrolling
    };

    const updateLightboxContent = () => {
        const photo = currentlyDisplayedPhotos[currentLightboxIndex];
        if (!photo) return;

        lightboxImage.src = photo.url;
        lightboxImage.alt = photo.name;
        lightboxCaption.textContent = photo.name;
        lightboxCounter.textContent = `${currentLightboxIndex + 1} of ${currentlyDisplayedPhotos.length}`;

        // Update navigation buttons
        lightboxPrev.disabled = currentLightboxIndex === 0;
        lightboxNext.disabled = currentLightboxIndex === currentlyDisplayedPhotos.length - 1;

        // Update download button
        lightboxDownload.onclick = () => forceDownload(photo.url, photo.name);
    };

    const navigateLightbox = (direction) => {
        const newIndex = currentLightboxIndex + direction;
        if (newIndex >= 0 && newIndex < currentlyDisplayedPhotos.length) {
            currentLightboxIndex = newIndex;
            updateLightboxContent();
        }
    };


    // --- Photo Rendering ---
    const renderPhotos = (photos) => {
        photosContainer.innerHTML = '';
        currentlyDisplayedPhotos = photos;

        if (!photos || photos.length === 0) {
            photosContainer.className = 'col-span-full';
            photosContainer.innerHTML = `<p class="text-center text-gray-500 py-10">No photos were found in this album.</p>`;
            return;
        }

        photosContainer.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4';

        photos.forEach((photo, index) => {
            const photoCard = document.createElement('div');
            photoCard.className = 'photo-item aspect-square bg-gray-200 rounded-lg overflow-hidden group relative cursor-pointer';
            photoCard.innerHTML = `
                <img src="${photo.url}" alt="${photo.name}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy">
                <div class="photo-overlay absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <button data-url="${photo.url}" data-name="${photo.name}" class="photo-download-btn absolute top-2 right-2 h-10 w-10 bg-black bg-opacity-40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Download Photo">
                    <i class="fas fa-download text-white text-lg"></i>
                </button>
                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div class="bg-black bg-opacity-50 rounded-full p-3">
                        <i class="fas fa-expand text-white text-xl"></i>
                    </div>
                </div>
            `;

            // Add click handler for lightbox (but not on download button)
            photoCard.addEventListener('click', (e) => {
                if (!e.target.closest('.photo-download-btn')) {
                    openLightbox(index);
                }
            });

            photosContainer.appendChild(photoCard);
        });
    };

    // --- API Calls ---
    const fetchPhotos = async (url, token = null) => {
        photosContainer.innerHTML = `<div class="col-span-full text-center py-10"><div class="spinner"></div></div>`;
        try {
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const response = await fetch(url, { headers });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Failed to fetch photos:", error);
            photosContainer.innerHTML = `<p class="col-span-full text-red-500 text-center py-10">${error.message}</p>`;
            return [];
        }
    };

    // --- Main Application Logic ---
    const init = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const photographer = urlParams.get('photographer');
        const album = urlParams.get('album');
        const linkType = urlParams.get('type');

        // Store for later use
        currentPhotographer = photographer;
        currentAlbum = album;

        if (!photographer || !album || !linkType) {
            stopLoadingAnimation();
            showView('loading');
            loadingMessage.textContent = 'Error: Invalid event link.';
            loadingMessage.classList.add('text-red-500');
            if (loadingSubtext) loadingSubtext.classList.add('hidden');
            return;
        }

        const albumDisplayName = album.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        eventTitleGuest.textContent = `Welcome to ${albumDisplayName}`;
        eventTitleMain.textContent = albumDisplayName;

        if (linkType === 'vip') {
            const token = localStorage.getItem('authToken');
            if (!token) {
                stopLoadingAnimation();
                // Store redirect URL in localStorage for after registration
                localStorage.setItem('postLoginRedirectUrl', window.location.href);
                persistPendingAccess(photographer, album);

                // Update buttons to go to VIP signup page
                const vipSignupUrl = `vip_signup.html?redirect=${encodeURIComponent(window.location.href)}`;
                loginBtnGuest.href = vipSignupUrl;
                loginBtnGuest.textContent = "I've Registered Before";
                signupBtnGuest.href = vipSignupUrl;
                signupBtnGuest.textContent = 'Register to Find My Photos';

                // Just show the guest view with updated links
                showView('guest');
            } else {
                startLoadingAnimation('vip');
                await ensureVipAccess(photographer, album, token);

                try {
                    const result = await fetchPhotos(`/api/find-my-photos/${photographer}/${album}`, token);
                    stopLoadingAnimation();

                    const matches = result.matches || [];

                    if (matches.length === 0) {
                        // Show "no matches" with option to re-upload face photo
                        showNoMatchesWithReupload(albumDisplayName);
                    } else {
                        showView('gallery');
                        renderPhotos(matches);
                    }
                } catch (error) {
                    stopLoadingAnimation();
                    if (error.message.includes('reference_photo_missing') || error.message.includes('Reference photo')) {
                        showNoMatchesWithReupload(albumDisplayName);
                    } else {
                        showView('loading');
                        loadingMessage.textContent = 'Error: ' + error.message;
                        loadingMessage.classList.add('text-red-500');
                    }
                }
            }
        } else if (linkType === 'full') {
            startLoadingAnimation('full');
            const photos = await fetchPhotos(`/api/event/${photographer}/${album}`);
            stopLoadingAnimation();
            showView('gallery');
            renderPhotos(photos);
        } else {
            stopLoadingAnimation();
            showView('loading');
            loadingMessage.textContent = 'Error: Invalid link type specified.';
            loadingMessage.classList.add('text-red-500');
            if (loadingSubtext) loadingSubtext.classList.add('hidden');
        }
    };

    // --- Show No Matches with Re-upload Option ---
    const showNoMatchesWithReupload = (albumName) => {
        photosContainer.innerHTML = `
            <div class="col-span-full text-center py-10">
                <div class="max-w-md mx-auto bg-white p-8 rounded-xl shadow-lg">
                    <i class="fas fa-face-frown fa-3x text-gray-400 mb-4"></i>
                    <h2 class="text-xl font-semibold text-dark-color mb-2">No Photos Found</h2>
                    <p class="text-gray-color mb-6">We couldn't find any photos of you in ${albumName}. This might happen if your face photo isn't clear enough.</p>
                    
                    <div class="border-t pt-6">
                        <h3 class="font-medium text-dark-color mb-3">Try uploading a new face photo</h3>
                        <form id="reupload-form" enctype="multipart/form-data" class="space-y-4">
                            <input type="file" id="new-face-photo" name="ref_photo" accept="image/*" required
                                class="w-full text-sm text-gray-color file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark">
                            <p class="text-xs text-gray-400">Upload a clear, forward-facing photo of yourself</p>
                            <button type="submit" id="reupload-btn" class="w-full bg-primary text-white py-2.5 px-4 rounded-lg hover:bg-primary-dark transition-colors">
                                <i class="fas fa-sync-alt"></i> Re-scan Album
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        showView('gallery');

        // Handle re-upload form
        const reuploadForm = document.getElementById('reupload-form');
        reuploadForm.addEventListener('submit', handleReupload);
    };

    // --- Handle Face Photo Re-upload ---
    const handleReupload = async (e) => {
        e.preventDefault();
        const token = localStorage.getItem('authToken');
        const reuploadBtn = document.getElementById('reupload-btn');
        const fileInput = document.getElementById('new-face-photo');

        if (!fileInput.files[0]) {
            alert('Please select a photo first.');
            return;
        }

        const formData = new FormData();
        formData.append('ref_photo', fileInput.files[0]);

        try {
            reuploadBtn.disabled = true;
            reuploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            // Upload new face photo
            const uploadResponse = await fetch('/api/auth/vip-update-photo', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!uploadResponse.ok) {
                const error = await uploadResponse.json();
                throw new Error(error.error || 'Failed to upload photo');
            }

            reuploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';

            // Re-fetch photos with new face
            const result = await fetchPhotos(`/api/find-my-photos/${currentPhotographer}/${currentAlbum}`, token);
            const matches = result.matches || [];

            if (matches.length === 0) {
                alert('Still no matches found. Please try a different photo with better lighting and a clear view of your face.');
                reuploadBtn.disabled = false;
                reuploadBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Re-scan Album';
            } else {
                renderPhotos(matches);
            }
        } catch (error) {
            alert('Error: ' + error.message);
            reuploadBtn.disabled = false;
            reuploadBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Re-scan Album';
        }
    };

    // --- Event Listeners ---

    // MODIFIED: Listener for the "Download All" button.
    downloadAllBtn.addEventListener('click', () => {
        if (currentlyDisplayedPhotos.length === 0) {
            alert("There are no photos to download.");
            return;
        }

        // Show a dialog to the user explaining what will happen.
        const userConfirmed = confirm(
            `You are about to download ${currentlyDisplayedPhotos.length} photos.\n\nYour browser will ask you to save each file individually. Do you want to continue?`
        );

        if (userConfirmed) {
            currentlyDisplayedPhotos.forEach((photo, index) => {
                setTimeout(() => {
                    forceDownload(photo.url, photo.name);
                }, index * 1000); // Stagger downloads by 1 second to be safe
            });
        }
    });

    // MODIFIED: Use event delegation for single photo downloads.
    photosContainer.addEventListener('click', (event) => {
        const downloadButton = event.target.closest('.photo-download-btn');
        if (downloadButton) {
            event.stopPropagation(); // Prevent opening lightbox
            const url = downloadButton.dataset.url;
            const name = downloadButton.dataset.name;
            forceDownload(url, name);
        }
    });

    // --- Lightbox Event Listeners ---
    closeLightbox.addEventListener('click', closeLightboxModal);
    lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
    lightboxNext.addEventListener('click', () => navigateLightbox(1));

    // Close lightbox when clicking outside the image
    lightboxModal.addEventListener('click', (e) => {
        if (e.target === lightboxModal) {
            closeLightboxModal();
        }
    });

    // Keyboard navigation for lightbox
    document.addEventListener('keydown', (e) => {
        if (!lightboxModal.classList.contains('hidden')) {
            switch (e.key) {
                case 'Escape':
                    closeLightboxModal();
                    break;
                case 'ArrowLeft':
                    navigateLightbox(-1);
                    break;
                case 'ArrowRight':
                    navigateLightbox(1);
                    break;
            }
        }
    });

    // --- Swipe Functionality ---
    let touchStartX = 0;
    let touchEndX = 0;

    lightboxModal.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    lightboxModal.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    const handleSwipe = () => {
        if (touchEndX < touchStartX - 50) {
            // Swipe Left -> Next
            navigateLightbox(1);
        }
        if (touchEndX > touchStartX + 50) {
            // Swipe Right -> Prev
            navigateLightbox(-1);
        }
    };

    // --- Start the application ---
    init();
});