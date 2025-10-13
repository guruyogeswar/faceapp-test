document.addEventListener('DOMContentLoaded', async () => {
    const DOMElements = {
        loginBtnNav: document.getElementById('loginBtnNav'),
        signinBtnNav: document.getElementById('signinBtnNav'),
        profileDropdownContainer: document.getElementById('profileDropdownContainer'),
        profileDropdownButton: document.getElementById('profileDropdownButton'),
        profileDropdownMenu: document.getElementById('profileDropdownMenu'),
        dropdownProfileInitials: document.getElementById('dropdownProfileInitials'), // Target for avatar in dropdown
        dropdownUserName: document.getElementById('dropdownUserName'),
        dropdownUserEmail: document.getElementById('dropdownUserEmail'),
        logoutBtnDropdown: document.getElementById('logoutBtnDropdown'),
        loginBtnNavMobile: document.getElementById('loginBtnNavMobile'),
        signinBtnNavMobile: document.getElementById('signinBtnNavMobile'),
        profileContainerMobile: document.getElementById('profileContainerMobile'),
        profileInitialsMobile: document.getElementById('profileInitialsMobile'), // Target for mobile avatar
        userNameMobile: document.getElementById('userNameMobile'),
        userEmailMobile: document.getElementById('userEmailMobile'),
        logoutBtnNavMobile: document.getElementById('logoutBtnNavMobile'),
        hamburger: document.getElementById('hamburger'),
        mobileNavLinksMenu: document.getElementById('mobileNavLinksMenu'),
    };

    const API_BASE_URL = '';

    function updateUserNavUI(isLoggedIn, userData = null) {
        const showAuthLinks = isLoggedIn ? 'none' : 'inline-block';
        const showProfile = isLoggedIn ? 'block' : 'none';

        // Toggle login/signup vs profile buttons
        [DOMElements.loginBtnNav, DOMElements.signinBtnNav, DOMElements.loginBtnNavMobile, DOMElements.signinBtnNavMobile].forEach(el => {
            if (el) el.style.display = showAuthLinks;
        });
        [DOMElements.profileDropdownContainer, DOMElements.profileContainerMobile].forEach(el => {
            if (el) el.style.display = showProfile;
        });

        if (isLoggedIn && userData) {
            const username = userData.username || "User";
            const email = userData.email || `${username.toLowerCase().split(' ')[0]}@example.com`;
            const initials = username.substring(0, 1).toUpperCase();
            const photoUrl = userData.ref_photo_url;

            // --- Desktop Profile Icon Logic ---
            if (DOMElements.profileDropdownButton && DOMElements.dropdownProfileInitials) {
                if (photoUrl) {
                    DOMElements.profileDropdownButton.innerHTML = `<img src="${photoUrl}" alt="${username}" class="w-full h-full object-cover rounded-full">`;
                    DOMElements.dropdownProfileInitials.innerHTML = `<img src="${photoUrl}" alt="${username}" class="w-full h-full object-cover rounded-full">`;
                } else {
                    DOMElements.profileDropdownButton.innerHTML = `<span class="profile-initials-text">${initials}</span>`;
                    DOMElements.dropdownProfileInitials.innerHTML = `${initials}`;
                }
            }

            // --- Mobile Profile Icon Logic ---
            if (DOMElements.profileInitialsMobile) {
                if (photoUrl) {
                    DOMElements.profileInitialsMobile.innerHTML = `<img src="${photoUrl}" alt="${username}" class="w-full h-full object-cover rounded-full">`;
                } else {
                    DOMElements.profileInitialsMobile.innerHTML = `${initials}`;
                }
            }
            
            // Update names and emails
            if (DOMElements.dropdownUserName) DOMElements.dropdownUserName.textContent = username;
            if (DOMElements.dropdownUserEmail) DOMElements.dropdownUserEmail.textContent = email;
            if (DOMElements.userNameMobile) DOMElements.userNameMobile.textContent = username;
            if (DOMElements.userEmailMobile) DOMElements.userEmailMobile.textContent = email;

        } else if (DOMElements.profileDropdownMenu) {
            DOMElements.profileDropdownMenu.classList.add('hidden');
            if(DOMElements.profileDropdownButton) DOMElements.profileDropdownButton.setAttribute('aria-expanded', 'false');
        }
    }

    async function checkUserLoginStatus() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            updateUserNavUI(false);
            return false;
        }
        
        // Optimistic update from local storage first for speed
        const storedUsername = localStorage.getItem('username');
        const storedPhotoUrl = localStorage.getItem('ref_photo_url');
        if (storedUsername) {
            updateUserNavUI(true, { username: storedUsername, ref_photo_url: storedPhotoUrl });
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.valid && data.username) {
                    const userData = { username: data.username, ref_photo_url: data.ref_photo_url };
                    updateUserNavUI(true, userData); 
                    localStorage.setItem('username', data.username);
                    if (data.ref_photo_url) {
                        localStorage.setItem('ref_photo_url', data.ref_photo_url);
                    } else {
                        localStorage.removeItem('ref_photo_url');
                    }
                    return true;
                }
            }
            handleUserLogout();
            return false;
        } catch (error) {
            console.error("Error verifying token:", error);
            handleUserLogout();
            return false;
        }
    }

    function handleUserLogout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        localStorage.removeItem('userEmail'); 
        localStorage.removeItem('ref_photo_url');
        updateUserNavUI(false);
        
        if (DOMElements.profileDropdownMenu) DOMElements.profileDropdownMenu.classList.add('hidden');
        if (DOMElements.profileDropdownButton) DOMElements.profileDropdownButton.setAttribute('aria-expanded', 'false');
        if (DOMElements.mobileNavLinksMenu) DOMElements.mobileNavLinksMenu.classList.add('hidden');
        
        // Redirect home after logout to ensure a clean state
        if (!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('index.html')) {
           window.location.href = 'index.html';
        }
    }

    DOMElements.hamburger?.addEventListener('click', () => {
        const isExpanded = DOMElements.hamburger.getAttribute('aria-expanded') === 'true';
        DOMElements.hamburger.setAttribute('aria-expanded', String(!isExpanded));
        DOMElements.mobileNavLinksMenu.classList.toggle('hidden');
        const icon = DOMElements.hamburger.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-times');
        }
    });

    DOMElements.profileDropdownButton?.addEventListener('click', (event) => {
        event.stopPropagation(); 
        if (DOMElements.profileDropdownMenu) {
            const isHidden = DOMElements.profileDropdownMenu.classList.toggle('hidden');
            if(DOMElements.profileDropdownButton) DOMElements.profileDropdownButton.setAttribute('aria-expanded', String(!isHidden));
        }
    });

    document.addEventListener('click', (event) => {
        if (DOMElements.profileDropdownContainer && !DOMElements.profileDropdownContainer.contains(event.target)) {
            DOMElements.profileDropdownMenu.classList.add('hidden');
            if(DOMElements.profileDropdownButton) DOMElements.profileDropdownButton.setAttribute('aria-expanded', 'false');
        }
    });

    DOMElements.logoutBtnDropdown?.addEventListener('click', (e) => { e.preventDefault(); handleUserLogout(); });
    DOMElements.logoutBtnNavMobile?.addEventListener('click', (e) => { e.preventDefault(); handleUserLogout(); });

    await checkUserLoginStatus();
});