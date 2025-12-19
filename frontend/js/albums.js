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
        vipLinkContainer: document.getElementById('vip-link-container'),
        fullLinkContainer: document.getElementById('full-link-container'),
    };

    let currentUser = null;
    let isAttendee = false;

    const API_BASE_URL = '';
    const ML_API_BASE_URL = 'http://localhost:8080/';

    // --- Delete Mode State ---
    let isDeleteMode = false;
    let selectedAlbums = new Set();

    function showConfirmationModal(title, message, onConfirm) {
        const modal = document.getElementById('confirmation-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalMessage = document.getElementById('modal-message');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        if (!modal || !confirmBtn || !cancelBtn) {
            if (confirm(message)) onConfirm();
            return;
        }

        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modal.style.display = 'flex';
        confirmBtn.onclick = async () => {
            modal.style.display = 'none';
            await onConfirm();
        };
        cancelBtn.onclick = () => modal.style.display = 'none';
    }

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
            isAttendee = data.role === 'attendee';

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
            card.className = 'album-card-item bg-white rounded-xl shadow-lg overflow-hidden group transition-all duration-200';
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

            card.innerHTML = `
                <div class="relative">
                    <div class="w-full h-48 bg-gray-200 overflow-hidden cursor-pointer img-container relative">
                        <img src="${coverUrl}" alt="${album.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform">
                        <!-- Selection Overlay (Checkmark) -->
                        <div class="selection-checkmark absolute top-2 left-2 w-8 h-8 bg-white rounded-full items-center justify-center shadow-md z-20" style="display: none;">
                            <i class="fas fa-check text-red-600 font-bold"></i>
                        </div>
                    </div>
                    ${shareButtonHTML}
                </div>
                <div class="p-5 info-container cursor-pointer">
                    <h3 class="text-lg font-semibold truncate">${album.name}</h3>
                    <p class="text-xs text-gray-500">${album.photo_count || 0} photos</p>
                    ${photographerInfo}
                </div>`;

            const viewTarget = `/event.html?photographer=${album.photographer}&album=${album.id}&type=vip`;

            const handleCardClick = (e) => {
                if (e.target.closest('.share-album-btn')) return;

                if (isDeleteMode && !isAttendee) {
                    if (selectedAlbums.has(album.id)) {
                        selectedAlbums.delete(album.id);
                    } else {
                        selectedAlbums.add(album.id);
                    }
                    updateAlbumSelectionVisuals();
                } else {
                    if (isAttendee) {
                        window.location.href = viewTarget;
                    } else {
                        loadAlbumDetailView(album.id, album.name);
                    }
                }
            };

            card.querySelector('.img-container').addEventListener('click', handleCardClick);
            card.querySelector('.info-container').addEventListener('click', handleCardClick);

            DOMElements.albumGrid.appendChild(card);
        });

        // Update visuals in case we just re-rendered while in delete mode
        if (isDeleteMode) updateAlbumSelectionVisuals();
    }

    function updateAlbumSelectionVisuals() {
        const selectedCountSpan = document.getElementById('selectedCount');
        if (selectedCountSpan) selectedCountSpan.textContent = selectedAlbums.size;

        const cards = DOMElements.albumGrid.querySelectorAll('.album-card-item');
        cards.forEach(card => {
            const id = card.dataset.albumId;
            const checkmark = card.querySelector('.selection-checkmark');

            if (selectedAlbums.has(id)) {
                card.classList.add('ring-4', 'ring-red-500', 'scale-95');
                if (checkmark) checkmark.style.display = 'flex';
            } else {
                card.classList.remove('ring-4', 'ring-red-500', 'scale-95');
                if (checkmark) checkmark.style.display = 'none';
            }
        });
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

    function displayAlbumPhotos(photos) {
        if (!DOMElements.photoGrid || !DOMElements.noPhotosMessage) return;

        DOMElements.photoGrid.innerHTML = '';
        const hasPhotos = photos && photos.length > 0;

        DOMElements.noPhotosMessage.style.display = hasPhotos ? 'none' : 'block';
        DOMElements.photoGrid.style.display = hasPhotos ? 'grid' : 'none';

        if (!hasPhotos) return;

        photos.forEach(photo => {
            const photoItem = document.createElement('div');
            photoItem.className = 'photo-item group relative aspect-square rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-shadow duration-300';
            photoItem.innerHTML = `
                <img src="${photo.url}" alt="${photo.name}" class="w-full h-full object-cover" loading="lazy">
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-300"></div>
                
                <!-- Selection Overlay (Visible when selected) -->
                <div class="selection-overlay absolute inset-0 bg-white bg-opacity-30 flex items-center justify-center transition-opacity duration-200 opacity-0 pointer-events-none">
                     <div class="bg-white rounded-full p-2 shadow-lg">
                        <i class="fas fa-check text-red-600 text-xl font-bold"></i>
                     </div>
                </div>

                <input type="checkbox" class="absolute top-2 right-2 h-6 w-6 rounded text-primary focus:ring-primary-dark opacity-0 group-hover:opacity-100 photo-checkbox transition-opacity duration-300 z-10" data-photo-id="${photo.id}">
                
                <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 to-transparent pointer-events-none">
                    <p class="text-white text-xs truncate">${photo.name}</p>
                </div>
            `;

            // Add click handler for lightbox or selection
            photoItem.addEventListener('click', (e) => {
                // If clicked directly on checkbox, let it propagate (it handles itself)
                if (e.target.classList.contains('photo-checkbox')) return;

                const toggleBtn = document.getElementById('togglePhotoDeleteModeBtn');
                const isSelectionMode = toggleBtn && toggleBtn.classList.contains('active-selection-mode');

                if (isSelectionMode) {
                    e.preventDefault();
                    // Toggle the checkbox
                    const checkbox = photoItem.querySelector('.photo-checkbox');
                    checkbox.checked = !checkbox.checked;
                    // Manually trigger the change event so the listener in setupPhotoSelection picks it up
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    window.openLightbox(photo, photos);
                }
            });

            // Listen for checkbox changes to update local visuals (optional but nice)
            const checkbox = photoItem.querySelector('.photo-checkbox');
            checkbox.addEventListener('change', () => {
                const overlay = photoItem.querySelector('.selection-overlay');
                if (checkbox.checked) {
                    photoItem.classList.add('ring-4', 'ring-red-500', 'ring-inset');
                    overlay.classList.remove('opacity-0');
                } else {
                    photoItem.classList.remove('ring-4', 'ring-red-500', 'ring-inset');
                    overlay.classList.add('opacity-0');
                }
            });

            DOMElements.photoGrid.appendChild(photoItem);
        });

        // Check if we are already in selection mode to show checkboxes/visuals?
        // The toggle button logic handles showing/hiding checkboxes via opacity classes, 
        // but if we re-render (e.g. after upload), we might need to sync state.
        // For now, let's leave it, as toggle button click handles the class toggling on existing elements.
        // A robust solution would check state here and apply classes immediately.
        const toggleBtn = document.getElementById('togglePhotoDeleteModeBtn');
        if (toggleBtn && toggleBtn.classList.contains('active-selection-mode')) {
            const checkboxes = DOMElements.photoGrid.querySelectorAll('.photo-checkbox');
            checkboxes.forEach(cb => {
                cb.classList.remove('opacity-0', 'group-hover:opacity-100');
                cb.classList.add('opacity-100');
            });
        }
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

        // Toggle Selection Mode Button
        const toggleBtn = document.getElementById('togglePhotoDeleteModeBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const isSelecting = toggleBtn.classList.contains('active-selection-mode');
                const checkboxes = document.querySelectorAll('.photo-checkbox');

                if (!isSelecting) {
                    // Enter selection mode
                    toggleBtn.classList.add('active-selection-mode', 'bg-red-50', 'text-red-600', 'border-red-600');
                    toggleBtn.classList.remove('text-primary'); // Remove default text color if needed, depends on HTML

                    // Make checkboxes visible
                    checkboxes.forEach(cb => {
                        cb.classList.remove('opacity-0', 'group-hover:opacity-100');
                        cb.classList.add('opacity-100');
                    });
                } else {
                    // Exit selection mode
                    toggleBtn.classList.remove('active-selection-mode', 'bg-red-50', 'text-red-600', 'border-red-600');
                    toggleBtn.classList.add('text-primary'); // Restore

                    // Hide checkboxes (revert to hover only) and clear selection
                    checkboxes.forEach(cb => {
                        cb.classList.add('opacity-0', 'group-hover:opacity-100');
                        cb.classList.remove('opacity-100');
                        if (cb.checked) {
                            cb.checked = false;
                            // Dispatch change event so setupPhotoSelection clears its state and UI updates
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                }
            });
        }

        // Photo selection functionality
        setupPhotoSelection(albumId);

        // Lightbox functionality
        setupLightbox();
    }

    function setupPhotoSelection(albumId) {
        let selectedPhotos = [];
        // The delete button and count are now in the header, not a separate action bar
        const deleteBtn = document.getElementById('deleteSelectedPhotosBtn');
        const selectionCountSpan = document.getElementById('selectedPhotoCount');
        // We also have a toggle button that we might want to update text on, but the main toggle logic is handled in event listener

        if (!DOMElements.photoGrid) return;

        DOMElements.photoGrid.addEventListener('change', (e) => {
            if (e.target.classList.contains('photo-checkbox')) {
                const photoId = e.target.dataset.photoId;
                if (e.target.checked) {
                    selectedPhotos.push(photoId);
                } else {
                    selectedPhotos = selectedPhotos.filter(id => id !== photoId);
                }

                // Update selection UI
                if (deleteBtn && selectionCountSpan) {
                    if (selectedPhotos.length > 0) {
                        deleteBtn.style.display = 'flex';
                        selectionCountSpan.textContent = selectedPhotos.length;
                    } else {
                        deleteBtn.style.display = 'none';
                    }
                }
            }
        });

        // Clear selection button (logic moved to toggle button mostly, but good to have safety)
        // If we exit selection mode via toggle, we clear this array (handled in toggle listener context if we could access it, 
        // but here we just handle checkbox changes).

        // Actually, when we toggle "Select" OFF, we should clear everything.
        // The toggle button listener in setupDetailViewEventListeners handles UI state (hiding checkboxes).
        // It should also clear this array. However, this array is local to this closure.
        // To fix this cleanly without global state pollution, we can listen for a custom event or 
        // just let the user manually uncheck. 
        // For now, let's keep it simple: if you hide checkboxes, selection remains "conceptually" but you can't see it.
        // Better UX: modify toggle listener to uncheck all.

        // Download selected logic removed as it's not in the new template header

        // Attach Delete Listener (using replacement to avoid duplicate listeners)
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (selectedPhotos.length === 0) return;

                showConfirmationModal(
                    "Delete Photos",
                    `Are you sure you want to permanently delete ${selectedPhotos.length} photo${selectedPhotos.length !== 1 ? 's' : ''}?`,
                    async () => {
                        showToast("Deleting photos...", "info");
                        try {
                            const token = localStorage.getItem('authToken');
                            // Using the batch deletion endpoint
                            const response = await fetch(`/api/albums/${albumId}/photos/batch`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ photo_ids: selectedPhotos })
                            });

                            const data = await response.json();

                            if (response.ok) {
                                showToast("Photos deleted successfully", "success");
                                // Reset selection
                                selectedPhotos = [];
                                deleteBtn.style.display = 'none';

                                // Reload photos
                                loadAlbumPhotos(albumId);
                            } else {
                                showToast(data.error || "Failed to delete photos", "error");
                            }
                        } catch (error) {
                            console.error('Delete error:', error);
                            showToast("Error deleting photos", "error");
                        }
                    }
                );
            });
        }
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

        // Swipe Functionality
        let touchStartX = 0;
        let touchEndX = 0;

        if (lightboxModal) {
            lightboxModal.addEventListener('touchstart', (e) => {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });

            lightboxModal.addEventListener('touchend', (e) => {
                touchEndX = e.changedTouches[0].screenX;
                handleSwipe();
            }, { passive: true });
        }

        function handleSwipe() {
            if (touchEndX < touchStartX - 50) { // Swipe Left (Next)
                if (currentPhotoIndex < currentPhotos.length - 1) {
                    if (nextBtn) nextBtn.click();
                }
            }
            if (touchEndX > touchStartX + 50) { // Swipe Right (Prev)
                if (currentPhotoIndex > 0) {
                    if (prevBtn) prevBtn.click();
                }
            }
        }

        window.openLightbox = function (photo, photos) {
            currentPhotos = photos;
            currentPhotoIndex = photos.findIndex(p => p.id === photo.id);
            showPhoto(currentPhotoIndex);
            lightboxModal.style.display = 'flex';
        };

        function showPhoto(index) {
            if (index < 0 || index >= currentPhotos.length) return;

            const photo = currentPhotos[index];
            if (lightboxImage) lightboxImage.src = photo.url;
            if (lightboxCaption) lightboxCaption.textContent = photo.name;

            if (prevBtn) prevBtn.disabled = index === 0;
            if (nextBtn) nextBtn.disabled = index === currentPhotos.length - 1;
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

        showToast('Uploading photos...', 'info');

        try {
            const token = localStorage.getItem('authToken');

            for (const file of files) {
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
            }

            showToast('Photos uploaded successfully!', 'success');

            // Reload photos
            await loadAlbumPhotos(albumId);

        } catch (error) {
            console.error('Upload error:', error);
            showToast('Failed to upload some photos', 'error');
        }

        // Reset the input
        event.target.value = '';
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

    // --- Main Page Delete Mode Listeners ---
    const toggleDeleteModeBtn = document.getElementById('toggleDeleteModeBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const deleteModeBtnText = document.getElementById('deleteModeBtnText');

    if (toggleDeleteModeBtn) {
        toggleDeleteModeBtn.addEventListener('click', () => {
            isDeleteMode = !isDeleteMode;
            if (isDeleteMode) {
                toggleDeleteModeBtn.classList.replace('bg-gray-100', 'bg-red-100');
                toggleDeleteModeBtn.classList.replace('text-gray-700', 'text-red-700');
                toggleDeleteModeBtn.classList.replace('border-gray-300', 'border-red-300'); // Note: border color class might differ in CSS, assumes standard tailwind
                // Fix: button style in HTML uses text-primary border-primary. Let's adjust classes carefully.
                toggleDeleteModeBtn.classList.add('bg-red-50', 'text-red-600', 'border-red-600');
                toggleDeleteModeBtn.classList.remove('text-primary', 'border-primary');

                if (deleteModeBtnText) deleteModeBtnText.textContent = "Exit Delete Mode";
                if (DOMElements.createAlbumBtn) DOMElements.createAlbumBtn.style.display = 'none';
                if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'flex';
            } else {
                toggleDeleteModeBtn.classList.remove('bg-red-50', 'text-red-600', 'border-red-600');
                toggleDeleteModeBtn.classList.add('text-primary', 'border-primary');

                if (deleteModeBtnText) deleteModeBtnText.textContent = "Select to Delete";
                if (DOMElements.createAlbumBtn) DOMElements.createAlbumBtn.style.display = 'flex';
                if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'none';

                selectedAlbums.clear();
                updateAlbumSelectionVisuals();
            }
        });
    }

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => {
            if (selectedAlbums.size === 0) return;
            showConfirmationModal(
                "Delete Albums",
                `Are you sure you want to permanently delete ${selectedAlbums.size} album(s)?`,
                async () => {
                    // Delete Logic
                    showToast("Deleting albums...", "info");
                    try {
                        const token = localStorage.getItem('authToken');
                        const response = await fetch('/api/albums/batch', {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ album_ids: Array.from(selectedAlbums) })
                        });
                        if (response.ok) {
                            showToast("Albums deleted successfully", "success");
                            // Reset UI
                            toggleDeleteModeBtn.click(); // Exit delete mode
                            fetchAlbums();
                        } else {
                            showToast("Failed to delete albums", "error");
                        }
                    } catch (e) {
                        showToast("Error deleting albums", "error");
                    }
                }
            );
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