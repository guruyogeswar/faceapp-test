document.addEventListener('DOMContentLoaded', async () => {
    const DOMElements = {
        loginPromptDiv: document.getElementById('login-prompt'),
        albumsMainContentDiv: document.getElementById('albums-main-content'),
        navTabButtons: document.querySelectorAll('.nav-tab-button'),
        viewContainer: document.getElementById('view-container'),
        manageAlbumsView: document.getElementById('manage-albums-view'),
        albumDetailView: document.getElementById('album-detail-view'),
        createAlbumBtn: document.getElementById('createAlbumBtn'),
        createAlbumFormContainer: document.getElementById('createAlbumFormContainer'),
        createAlbumForm: document.getElementById('createAlbumForm'),
        newAlbumNameInput: document.getElementById('newAlbumName'),
        cancelCreateAlbumBtn: document.getElementById('cancelCreateAlbumBtn'),
        albumGrid: document.getElementById('album-grid'),
        albumGridLoader: document.getElementById('album-grid-loader'),
        noAlbumsMessage: document.getElementById('no-albums-message'),
        photoGrid: null,
        photoGridLoader: null,
        noPhotosMessage: null,
        toastContainer: document.getElementById('toast-container'),
        shareModal: document.getElementById('share-modal'),
        closeShareModalBtn: document.getElementById('close-share-modal'),
        shareLinkVipInput: document.getElementById('share-link-vip-input'),
        shareLinkFullInput: document.getElementById('share-link-full-input'),
        accessLevelButton: document.getElementById('access-level-button'),
        accessLevelDropdown: document.getElementById('access-level-dropdown'),
        accessLevelIcon: document.getElementById('access-level-icon'),
        accessLevelText: document.getElementById('access-level-text'),
        accessLevelSubtext: document.getElementById('access-level-subtext'),
        uploadLoadingOverlay: document.getElementById('upload-loading-overlay'),
        uploadProgressBar: document.getElementById('upload-progress-bar'),
        uploadStatusText: document.getElementById('upload-status-text'),
        vipLinkContainer: document.getElementById('vip-link-container'),
        fullLinkContainer: document.getElementById('full-link-container'),
    };

    // ... (rest of DOMElements properties usually, but we are inserting into the list. Wait, replace_file_content for DOMElements might be tricky if I don't see the whole block.
    // Let's target the DOMElements block first to add the key, then the function.
    // Actually, I can just add it to the DOMElements definition.

    // Better approach:
    // 1. Add 'uploadLoadingOverlay' etc to DOMElements.
    // 2. Update handlePhotoUpload to use it.

    // STARTING WITH DOMElements modification


    let currentUser = null;
    let isAttendee = false;

    const API_BASE_URL = '';
    const ML_API_BASE_URL = 'http://localhost:8080/';

    function showToast(message, type = 'info') {
        if (!DOMElements.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} show`;
        toast.innerHTML = `<span class="toast-message">${message}</span><button class="toast-close">&times;</button>`;
        DOMElements.toastContainer.appendChild(toast);
        const autoDismiss = setTimeout(() => {
            toast.remove();
        }, 5000);
        toast.querySelector('.toast-close').addEventListener('click', () => {
            clearTimeout(autoDismiss);
            toast.remove();
        });
    }

    async function checkLoginStatusForAlbums() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            if (DOMElements.loginPromptDiv) DOMElements.loginPromptDiv.style.display = 'block';
            if (DOMElements.albumsMainContentDiv) DOMElements.albumsMainContentDiv.style.display = 'none';
            return false;
        }
        try {
            const response = await fetch('/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Session expired');
            const data = await response.json();

            currentUser = { username: data.username, role: data.role };
            isAttendee = data.role === 'attendee' || data.role === 'vip_attendee';

            if (DOMElements.loginPromptDiv) DOMElements.loginPromptDiv.style.display = 'none';
            if (DOMElements.albumsMainContentDiv) DOMElements.albumsMainContentDiv.style.display = 'block';
            return true;
        } catch (error) {
            localStorage.clear();
            if (DOMElements.loginPromptDiv) DOMElements.loginPromptDiv.style.display = 'block';
            if (DOMElements.albumsMainContentDiv) DOMElements.albumsMainContentDiv.style.display = 'none';
            return false;
        }
    }

    function setupAlbumPageForRole() {
        const manageAlbumsTab = document.querySelector('[data-view="manage-albums"]');
        const createAlbumButton = document.getElementById('createAlbumBtn');
        let h2Title = document.querySelector('#manage-albums-view h2');
        const createAlbumSection = document.getElementById('createAlbumFormContainer');

        if (isAttendee) {
            if (manageAlbumsTab) manageAlbumsTab.innerHTML = `<i class="fas fa-images"></i><span>Shared With Me</span>`;
            if (createAlbumButton) createAlbumButton.style.display = 'none';
            if (h2Title) h2Title.textContent = "Albums Shared With You";
            if (createAlbumSection) createAlbumSection.style.display = 'none';
            // Hide delete button for attendees
            const deleteBtn = document.getElementById('toggleDeleteModeBtn');
            if (deleteBtn) deleteBtn.style.display = 'none';
        } else { // Is photographer
            if (manageAlbumsTab) manageAlbumsTab.innerHTML = `<i class="fas fa-images"></i><span>Manage Albums</span>`;
            if (createAlbumButton) createAlbumButton.style.display = 'flex';
            if (h2Title) h2Title.textContent = "Your Albums";
            if (createAlbumSection && createAlbumSection.dataset.defaultVisible !== 'false') {
                createAlbumSection.style.display = 'none';
            }
        }
    }

    function switchView(viewId) {
        if (DOMElements.viewContainer) {
            Array.from(DOMElements.viewContainer.children).forEach(child => {
                child.style.display = 'none'
            });
        }
        const activeSection = document.getElementById(viewId);
        if (activeSection) {
            activeSection.style.display = 'block';
        }
    }

    async function fetchAlbums() {
        const token = localStorage.getItem('authToken');
        if (DOMElements.albumGridLoader) DOMElements.albumGridLoader.style.display = 'grid';

        const endpoint = '/api/albums';

        try {
            const response = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch albums');
            const albums = await response.json();
            displayAlbums(albums);
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            if (DOMElements.albumGridLoader) DOMElements.albumGridLoader.style.display = 'none';
        }
    }

    // Track album select mode state
    let isInAlbumSelectMode = false;
    let selectedAlbumIds = new Set();

    function displayAlbums(albums) {
        if (!DOMElements.albumGrid || !DOMElements.noAlbumsMessage) return;

        DOMElements.albumGrid.innerHTML = '';
        const hasAlbums = albums && albums.length > 0;

        let emptyMessage = isAttendee
            ? "No albums have been shared with you yet. When a photographer grants you access, their albums will appear here."
            : "You don't have any albums yet. Click 'Create New Album' to get started!";
        DOMElements.noAlbumsMessage.innerHTML = `<i class="fas fa-folder-open fa-3x mb-4 text-gray-400"></i><br>${emptyMessage}`;

        DOMElements.noAlbumsMessage.style.display = hasAlbums ? 'none' : 'block';
        DOMElements.albumGrid.style.display = hasAlbums ? 'grid' : 'none';

        if (!hasAlbums) return;

        albums.forEach(album => {
            const card = document.createElement('div');
            card.className = 'album-card-item bg-white rounded-xl shadow-lg overflow-hidden group transition-all duration-300';
            card.dataset.albumId = album.id;
            const coverUrl = album.cover || `https://placehold.co/400x300/e0e0e0/777?text=${encodeURIComponent(album.name)}`;

            const photographerLabel = album.photographer || 'Photographer';
            const photographerInfo = isAttendee ? `<p class="text-xs text-gray-500 mt-1">by ${photographerLabel}</p>` : '';
            const shareButtonHTML = !isAttendee ? `
                <div class="absolute top-2 right-2 z-10">
                    <button class="share-album-btn bg-black bg-opacity-40 text-white rounded-full h-9 w-9 flex items-center justify-center hover:bg-opacity-60 transition-opacity" data-album-id="${album.id}" title="Share Album">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>` : '';

            // Selection indicator for albums (hidden by default)
            const selectIndicator = `
                <div class="album-select-indicator absolute top-2 left-2 h-7 w-7 rounded-full border-2 border-white bg-black/30 flex items-center justify-center transition-all duration-200 hidden z-10">
                    <i class="fas fa-check text-white text-sm"></i>
                </div>`;

            card.innerHTML = `
                <div class="relative">
                    <div class="w-full h-48 bg-gray-200 overflow-hidden cursor-pointer img-container">
                        <img src="${coverUrl}" alt="${album.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform">
                    </div>
                    ${selectIndicator}
                    ${shareButtonHTML}
                </div>
                <div class="p-5 info-container cursor-pointer">
                    <h3 class="text-lg font-semibold truncate">${album.name}</h3>
                    <p class="text-xs text-gray-500">${album.photo_count || 0} photos</p>
                    ${photographerInfo}
                </div>`;

            const viewTarget = `/event.html?photographer=${album.photographer}&album=${album.id}&type=vip`;

            // Click handlers - behavior depends on mode
            const handleAlbumClick = () => {
                if (isInAlbumSelectMode) {
                    toggleAlbumSelection(album.id, card);
                } else {
                    if (isAttendee) {
                        window.location.href = viewTarget;
                    } else {
                        loadAlbumDetailView(album.id, album.name);
                    }
                }
            };

            card.querySelector('.img-container').addEventListener('click', handleAlbumClick);
            card.querySelector('.info-container').addEventListener('click', handleAlbumClick);

            DOMElements.albumGrid.appendChild(card);
        });
    }

    function toggleAlbumSelection(albumId, card) {
        const indicator = card.querySelector('.album-select-indicator');

        if (selectedAlbumIds.has(albumId)) {
            selectedAlbumIds.delete(albumId);
            card.classList.remove('ring-4', 'ring-red-500', 'ring-offset-2');
            if (indicator) {
                indicator.classList.add('hidden');
                indicator.classList.remove('bg-red-500');
            }
        } else {
            selectedAlbumIds.add(albumId);
            card.classList.add('ring-4', 'ring-red-500', 'ring-offset-2');
            if (indicator) {
                indicator.classList.remove('hidden');
                indicator.classList.add('bg-red-500');
            }
        }

        updateAlbumSelectionUI();
    }

    function updateAlbumSelectionUI() {
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        const countSpan = document.getElementById('selectedCount');

        if (countSpan) countSpan.textContent = selectedAlbumIds.size;
        if (deleteBtn) {
            deleteBtn.disabled = selectedAlbumIds.size === 0;
            if (selectedAlbumIds.size === 0) {
                deleteBtn.classList.add('opacity-50');
            } else {
                deleteBtn.classList.remove('opacity-50');
            }
        }
    }

    function enterAlbumSelectMode() {
        isInAlbumSelectMode = true;
        selectedAlbumIds.clear();

        // Show all selection indicators
        document.querySelectorAll('.album-card-item').forEach(card => {
            const indicator = card.querySelector('.album-select-indicator');
            if (indicator) indicator.classList.remove('hidden');
        });

        // Update UI
        const toggleBtn = document.getElementById('toggleDeleteModeBtn');
        const toggleBtnText = document.getElementById('deleteModeBtnText');
        const deleteBtn = document.getElementById('deleteSelectedBtn');

        if (toggleBtnText) toggleBtnText.textContent = 'Cancel';
        if (toggleBtn) toggleBtn.classList.add('bg-red-100', 'text-red-600', 'border-red-600');
        if (deleteBtn) deleteBtn.style.display = 'flex';

        updateAlbumSelectionUI();
    }

    function exitAlbumSelectMode() {
        isInAlbumSelectMode = false;
        selectedAlbumIds.clear();

        // Hide all selection indicators and remove selection styling
        document.querySelectorAll('.album-card-item').forEach(card => {
            card.classList.remove('ring-4', 'ring-red-500', 'ring-offset-2');
            const indicator = card.querySelector('.album-select-indicator');
            if (indicator) {
                indicator.classList.add('hidden');
                indicator.classList.remove('bg-red-500');
            }
        });

        // Update UI
        const toggleBtn = document.getElementById('toggleDeleteModeBtn');
        const toggleBtnText = document.getElementById('deleteModeBtnText');
        const deleteBtn = document.getElementById('deleteSelectedBtn');

        if (toggleBtnText) toggleBtnText.textContent = 'Select to Delete';
        if (toggleBtn) toggleBtn.classList.remove('bg-red-100', 'text-red-600', 'border-red-600');
        if (deleteBtn) deleteBtn.style.display = 'none';
    }


    function setAccessLevel(type) {
        if (!DOMElements.accessLevelIcon) return; // Guard clause
        if (type === 'vip') {
            DOMElements.accessLevelIcon.className = 'fas fa-lock mr-2 text-gray-500';
            DOMElements.accessLevelText.textContent = 'VIP Access';
            DOMElements.accessLevelSubtext.textContent = 'Requires sign in for face recognition.';
            DOMElements.vipLinkContainer.style.display = 'block';
            DOMElements.fullLinkContainer.style.display = 'none';
        } else { // type === 'full'
            DOMElements.accessLevelIcon.className = 'fas fa-globe mr-2 text-gray-500';
            DOMElements.accessLevelText.textContent = 'Full Access';
            DOMElements.accessLevelSubtext.textContent = 'All photos.';
            DOMElements.vipLinkContainer.style.display = 'none';
            DOMElements.fullLinkContainer.style.display = 'block';
        }
        DOMElements.accessLevelDropdown.classList.add('hidden');
    }

    async function loadAlbumDetailView(albumId, albumName) {
        try {
            // Fetch the album detail template
            const templateResponse = await fetch('album_detail_template.html');
            const templateHTML = await templateResponse.text();

            // Inject the template into the detail view container
            DOMElements.albumDetailView.innerHTML = templateHTML;

            // Update DOM element references for the detail view
            updateDetailViewDOMElements();

            // Set album name in the template
            document.getElementById('breadcrumb-album-name').textContent = albumName;
            document.getElementById('detail-album-title').textContent = albumName;

            // Switch to the detail view
            switchView('album-detail-view');

            // Load photos for this album
            await loadAlbumPhotos(albumId);

            // Setup event listeners for the detail view
            setupDetailViewEventListeners(albumId);

        } catch (error) {
            console.error('Error loading album detail view:', error);
            showToast('Failed to load album details', 'error');
        }
    }

    function updateDetailViewDOMElements() {
        // Update DOM element references for the newly loaded detail view
        DOMElements.photoGrid = document.getElementById('photo-grid');
        DOMElements.photoGridLoader = document.getElementById('photo-grid-loader');
        DOMElements.noPhotosMessage = document.getElementById('no-photos-message');
    }

    async function loadAlbumPhotos(albumId) {
        if (!DOMElements.photoGrid || !DOMElements.photoGridLoader) return;

        try {
            // Show loading state
            DOMElements.photoGridLoader.style.display = 'grid';
            DOMElements.photoGrid.style.display = 'none';

            // Fetch photos from the API
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/albums/${albumId}/photos`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch photos');
            const photos = await response.json();

            // Display photos
            displayAlbumPhotos(photos);

        } catch (error) {
            console.error('Error loading album photos:', error);
            showToast('Failed to load photos', 'error');
        } finally {
            // Hide loading state
            DOMElements.photoGridLoader.style.display = 'none';
        }
    }

    // Track current select mode state globally within the albums module
    let isInSelectMode = false;
    let selectedPhotoIds = new Set();
    let currentAlbumPhotos = [];

    function displayAlbumPhotos(photos) {
        if (!DOMElements.photoGrid || !DOMElements.noPhotosMessage) return;

        DOMElements.photoGrid.innerHTML = '';
        currentAlbumPhotos = photos || [];
        const hasPhotos = currentAlbumPhotos.length > 0;

        DOMElements.noPhotosMessage.style.display = hasPhotos ? 'none' : 'block';
        DOMElements.photoGrid.style.display = hasPhotos ? 'grid' : 'none';

        if (!hasPhotos) return;

        currentAlbumPhotos.forEach(photo => {
            const photoItem = document.createElement('div');
            photoItem.className = 'photo-item group relative aspect-square rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300';
            photoItem.dataset.photoId = photo.id;
            photoItem.innerHTML = `
                <img src="${photo.url}" alt="${photo.name}" class="w-full h-full object-cover" loading="lazy">
                <div class="photo-overlay absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-300"></div>
                <div class="photo-select-indicator absolute top-2 right-2 h-7 w-7 rounded-full border-2 border-white bg-black/30 flex items-center justify-center transition-all duration-200 hidden">
                    <i class="fas fa-check text-white text-sm"></i>
                </div>
                <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 to-transparent">
                    <p class="text-white text-xs truncate">${photo.name}</p>
                </div>
            `;

            // Click handler - behavior depends on mode
            photoItem.addEventListener('click', (e) => {
                if (isInSelectMode) {
                    togglePhotoSelection(photo.id, photoItem);
                } else {
                    openLightbox(photo, currentAlbumPhotos);
                }
            });

            DOMElements.photoGrid.appendChild(photoItem);
        });
    }

    function togglePhotoSelection(photoId, photoItem) {
        const indicator = photoItem.querySelector('.photo-select-indicator');

        if (selectedPhotoIds.has(photoId)) {
            selectedPhotoIds.delete(photoId);
            photoItem.classList.remove('ring-4', 'ring-primary', 'ring-offset-2');
            if (indicator) {
                indicator.classList.add('hidden');
                indicator.classList.remove('bg-primary');
            }
        } else {
            selectedPhotoIds.add(photoId);
            photoItem.classList.add('ring-4', 'ring-primary', 'ring-offset-2');
            if (indicator) {
                indicator.classList.remove('hidden');
                indicator.classList.add('bg-primary');
            }
        }

        updateSelectionUI();
    }

    function updateSelectionUI() {
        const deleteBtn = document.getElementById('deleteSelectedPhotosBtn');
        const countSpan = document.getElementById('selectedPhotoCount');

        if (countSpan) countSpan.textContent = selectedPhotoIds.size;
        if (deleteBtn) {
            deleteBtn.disabled = selectedPhotoIds.size === 0;
            if (selectedPhotoIds.size === 0) {
                deleteBtn.classList.add('opacity-50');
            } else {
                deleteBtn.classList.remove('opacity-50');
            }
        }
    }

    function enterSelectMode() {
        isInSelectMode = true;
        selectedPhotoIds.clear();

        // Show all selection indicators
        document.querySelectorAll('.photo-item').forEach(item => {
            const indicator = item.querySelector('.photo-select-indicator');
            if (indicator) indicator.classList.remove('hidden');
        });

        // Update UI
        const toggleBtn = document.getElementById('togglePhotoDeleteModeBtn');
        const deleteBtnText = document.getElementById('photoDeleteModeBtnText');
        const deleteBtn = document.getElementById('deleteSelectedPhotosBtn');

        if (deleteBtnText) deleteBtnText.textContent = 'Cancel';
        if (toggleBtn) toggleBtn.classList.add('bg-red-100', 'text-red-600', 'border-red-600');
        if (deleteBtn) deleteBtn.style.display = 'flex';

        updateSelectionUI();
    }

    function exitSelectMode() {
        isInSelectMode = false;
        selectedPhotoIds.clear();

        // Hide all selection indicators and remove selection styling
        document.querySelectorAll('.photo-item').forEach(item => {
            item.classList.remove('ring-4', 'ring-primary', 'ring-offset-2');
            const indicator = item.querySelector('.photo-select-indicator');
            if (indicator) {
                indicator.classList.add('hidden');
                indicator.classList.remove('bg-primary');
            }
        });

        // Update UI
        const toggleBtn = document.getElementById('togglePhotoDeleteModeBtn');
        const deleteBtnText = document.getElementById('photoDeleteModeBtnText');
        const deleteBtn = document.getElementById('deleteSelectedPhotosBtn');

        if (deleteBtnText) deleteBtnText.textContent = 'Select';
        if (toggleBtn) toggleBtn.classList.remove('bg-red-100', 'text-red-600', 'border-red-600');
        if (deleteBtn) deleteBtn.style.display = 'none';
    }

    function setupDetailViewEventListeners(albumId) {
        // Breadcrumb back to albums
        const breadcrumbAlbums = document.getElementById('breadcrumb-albums');
        if (breadcrumbAlbums) {
            breadcrumbAlbums.addEventListener('click', (e) => {
                e.preventDefault();
                switchView('manage-albums-view');
            });
        }

        // Upload button functionality
        const uploadBtn = document.getElementById('uploadToAlbumBtn');
        const uploadInput = document.getElementById('uploadPhotosInput');

        if (uploadBtn && uploadInput) {
            uploadBtn.addEventListener('click', () => uploadInput.click());
            uploadInput.addEventListener('change', (e) => handlePhotoUpload(e, albumId));
        }

        // Photo selection functionality
        setupPhotoSelection(albumId);

        // Lightbox functionality
        setupLightbox();
    }

    function setupPhotoSelection(albumId) {
        const toggleBtn = document.getElementById('togglePhotoDeleteModeBtn');
        const deleteBtn = document.getElementById('deleteSelectedPhotosBtn');

        if (!toggleBtn || !deleteBtn) {
            console.warn('Photo selection buttons not found');
            return;
        }

        // Toggle select mode on/off
        toggleBtn.addEventListener('click', () => {
            if (isInSelectMode) {
                exitSelectMode();
            } else {
                enterSelectMode();
            }
        });

        // Handle delete button click
        deleteBtn.addEventListener('click', async () => {
            if (selectedPhotoIds.size === 0) {
                showToast('No photos selected', 'warning');
                return;
            }

            if (!confirm(`Are you sure you want to delete ${selectedPhotoIds.size} photo(s)? This cannot be undone.`)) {
                return;
            }

            try {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

                const response = await fetch(`/api/albums/${albumId}/photos/batch`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    },
                    body: JSON.stringify({ photo_ids: Array.from(selectedPhotoIds) })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to delete photos');
                }

                const result = await response.json();
                showToast(`Successfully deleted ${result.deleted_count || selectedPhotoIds.size} photo(s)`, 'success');

                // Exit select mode and reload photos
                exitSelectMode();
                loadAlbumPhotos(albumId);

            } catch (error) {
                console.error('Delete error:', error);
                showToast('Error: ' + error.message, 'error');
            } finally {
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> <span>Delete (<span id="selectedPhotoCount">0</span>)</span>';
            }
        });
    }


    function setupLightbox() {
        const lightboxModal = document.getElementById('lightbox-modal');
        const lightboxImage = document.getElementById('lightbox-image');
        const lightboxCaption = document.getElementById('lightbox-caption');
        const closeLightbox = document.getElementById('close-lightbox');
        const prevBtn = document.getElementById('lightbox-prev');
        const nextBtn = document.getElementById('lightbox-next');

        let currentPhotoIndex = 0;
        let currentPhotos = [];

        window.openLightbox = function (photo, photos) {
            currentPhotos = photos;
            currentPhotoIndex = photos.findIndex(p => p.id === photo.id);
            showPhoto(currentPhotoIndex);
            lightboxModal.style.display = 'flex';
        };

        function showPhoto(index) {
            if (index < 0 || index >= currentPhotos.length) return;

            const photo = currentPhotos[index];
            lightboxImage.src = photo.url;
            lightboxCaption.textContent = photo.name;

            prevBtn.disabled = index === 0;
            nextBtn.disabled = index === currentPhotos.length - 1;
        }

        if (closeLightbox) {
            closeLightbox.addEventListener('click', () => {
                lightboxModal.style.display = 'none';
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentPhotoIndex > 0) {
                    currentPhotoIndex--;
                    showPhoto(currentPhotoIndex);
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentPhotoIndex < currentPhotos.length - 1) {
                    currentPhotoIndex++;
                    showPhoto(currentPhotoIndex);
                }
            });
        }

        // Close lightbox when clicking outside
        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) {
                lightboxModal.style.display = 'none';
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (lightboxModal.style.display === 'flex') {
                if (e.key === 'Escape') {
                    lightboxModal.style.display = 'none';
                } else if (e.key === 'ArrowLeft') {
                    prevBtn.click();
                } else if (e.key === 'ArrowRight') {
                    nextBtn.click();
                }
            }
        });
    }

    async function handlePhotoUpload(event, albumId) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        // Show overlay
        if (DOMElements.uploadLoadingOverlay) {
            DOMElements.uploadLoadingOverlay.style.display = 'flex';
            if (DOMElements.uploadProgressBar) DOMElements.uploadProgressBar.style.width = '0%';
            if (DOMElements.uploadStatusText) DOMElements.uploadStatusText.textContent = `Preparing to upload ${files.length} photos...`;
        }

        try {
            const token = localStorage.getItem('authToken');
            let completedCount = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                // Update specific status
                if (DOMElements.uploadStatusText) {
                    DOMElements.uploadStatusText.textContent = `Uploading ${i + 1} of ${files.length}: ${file.name}`;
                }

                const formData = new FormData();
                formData.append('file', file);
                formData.append('album', albumId);

                const response = await fetch('/api/upload-single-file', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Failed to upload ${file.name}`);
                }

                completedCount++;

                // Update progress bar
                if (DOMElements.uploadProgressBar) {
                    const percentage = Math.round((completedCount / files.length) * 100);
                    DOMElements.uploadProgressBar.style.width = `${percentage}%`;
                }
            }

            showToast('Photos uploaded successfully!', 'success');

            // Reload photos
            await loadAlbumPhotos(albumId);

        } catch (error) {
            console.error('Upload error:', error);
            showToast('Failed to upload some photos', 'error');
        } finally {
            // Hide overlay
            if (DOMElements.uploadLoadingOverlay) {
                DOMElements.uploadLoadingOverlay.style.display = 'none';
            }
            // Reset the input
            event.target.value = '';
        }
    }

    async function handleShareAlbumClick(albumId) {
        if (!currentUser || !currentUser.username) {
            showToast("You must be logged in to share.", "error");
            return;
        }
        const photographerUsername = currentUser.username;
        try {
            const token = localStorage.getItem('authToken');
            const response = await fetch(`/api/album/${photographerUsername}/${albumId}/share`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate links.');

            DOMElements.shareLinkVipInput.value = data.vip_link;
            DOMElements.shareLinkFullInput.value = data.full_access_link;

            setAccessLevel('vip');
            DOMElements.shareModal.style.display = 'flex';

        } catch (error) {
            showToast(`Error: ${error.message}`, "error");
        }
    }

    // --- Event Listeners ---
    if (DOMElements.createAlbumBtn) {
        DOMElements.createAlbumBtn.addEventListener('click', () => DOMElements.createAlbumFormContainer.style.display = 'block');
    }
    if (DOMElements.cancelCreateAlbumBtn) {
        DOMElements.cancelCreateAlbumBtn.addEventListener('click', () => DOMElements.createAlbumFormContainer.style.display = 'none');
    }
    if (DOMElements.createAlbumForm) {
        DOMElements.createAlbumForm.addEventListener('submit', async e => {
            e.preventDefault();
            const token = localStorage.getItem('authToken');
            const albumName = DOMElements.newAlbumNameInput.value;
            if (!albumName) {
                showToast("Album name cannot be empty.", "error");
                return;
            }
            await fetch('/api/create-album', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: albumName })
            });
            DOMElements.createAlbumFormContainer.style.display = 'none';
            DOMElements.createAlbumForm.reset();
            fetchAlbums();
        });
    }

    if (DOMElements.albumGrid) {
        DOMElements.albumGrid.addEventListener('click', e => {
            const shareButton = e.target.closest('.share-album-btn');
            if (shareButton) {
                e.stopPropagation();
                handleShareAlbumClick(shareButton.dataset.albumId);
            }
        });
    }

    if (DOMElements.closeShareModalBtn) {
        DOMElements.closeShareModalBtn.addEventListener('click', () => DOMElements.shareModal.style.display = 'none');
    }

    // Album selection mode toggle
    const albumToggleBtn = document.getElementById('toggleDeleteModeBtn');
    const albumDeleteBtn = document.getElementById('deleteSelectedBtn');

    if (albumToggleBtn) {
        albumToggleBtn.addEventListener('click', () => {
            if (isInAlbumSelectMode) {
                exitAlbumSelectMode();
            } else {
                enterAlbumSelectMode();
            }
        });
    }

    if (albumDeleteBtn) {
        albumDeleteBtn.addEventListener('click', async () => {
            if (selectedAlbumIds.size === 0) {
                showToast('No albums selected', 'warning');
                return;
            }

            if (!confirm(`Are you sure you want to delete ${selectedAlbumIds.size} album(s)? All photos in these albums will be permanently deleted.`)) {
                return;
            }

            try {
                albumDeleteBtn.disabled = true;
                albumDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

                const response = await fetch('/api/albums/batch', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    },
                    body: JSON.stringify({ album_ids: Array.from(selectedAlbumIds) })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to delete albums');
                }

                const result = await response.json();
                showToast(`Successfully deleted ${result.deleted_count || selectedAlbumIds.size} album(s)`, 'success');

                // Exit select mode and reload albums
                exitAlbumSelectMode();
                fetchAlbums();

            } catch (error) {
                console.error('Delete error:', error);
                showToast('Error: ' + error.message, 'error');
            } finally {
                albumDeleteBtn.disabled = false;
                albumDeleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> <span>Delete (<span id="selectedCount">0</span>)</span>';
            }
        });
    }


    async function copyShareLink(inputElement) {
        if (!inputElement) {
            return;
        }

        const value = inputElement.value;
        if (!value) {
            showToast("Nothing to copy.", "error");
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            showToast("Link copied!", "success");
            return;
        } catch (err) {
            // Ignore and try the fallback below.
        }

        // Fallback for browsers without secure-context clipboard support.
        inputElement.select();
        inputElement.setSelectionRange(0, value.length);
        try {
            const success = document.execCommand('copy');
            showToast(success ? "Link copied!" : "Copy failed.", success ? "success" : "error");
        } catch (err) {
            showToast("Copy failed.", "error");
        } finally {
            inputElement.setSelectionRange(0, 0);
            inputElement.blur();
        }
    }

    if (DOMElements.shareModal) {
        DOMElements.shareModal.addEventListener('click', (e) => {
            const copyButton = e.target.closest('.copy-share-link-btn');
            if (copyButton) {
                const linkType = copyButton.dataset.linkType;
                const inputToCopy = document.getElementById(`share-link-${linkType}-input`);
                copyShareLink(inputToCopy);
            } else if (e.target === DOMElements.shareModal) {
                DOMElements.shareModal.style.display = 'none';
            }
        });
    }

    DOMElements.accessLevelButton?.addEventListener('click', () => {
        DOMElements.accessLevelDropdown.classList.toggle('hidden');
    });

    DOMElements.accessLevelDropdown?.addEventListener('click', (e) => {
        e.preventDefault();
        const link = e.target.closest('a');
        if (link && link.dataset.accessType) {
            setAccessLevel(link.dataset.accessType);
        }
    });

    document.addEventListener('click', (e) => {
        if (DOMElements.accessLevelButton && !DOMElements.accessLevelButton.contains(e.target) && DOMElements.accessLevelDropdown && !DOMElements.accessLevelDropdown.contains(e.target)) {
            DOMElements.accessLevelDropdown.classList.add('hidden');
        }
    });

    async function initializePage() {
        // Wait a bit for global auth to initialize first
        await new Promise(resolve => setTimeout(resolve, 100));

        if (await checkLoginStatusForAlbums()) {
            setupAlbumPageForRole();
            switchView('manage-albums-view');
            fetchAlbums();
        }
    }

    // Wait for global auth to potentially initialize first
    setTimeout(initializePage, 200);
});