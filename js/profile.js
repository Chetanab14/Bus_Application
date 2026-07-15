// Initial profile state loaded on startup
let originalProfile = {
    name: "",
    email: "",
    phone: ""
};

// On Page Load
document.addEventListener("DOMContentLoaded", () => {
    // Check admin nav link
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    const adminNav = document.getElementById("admin-nav-item");
    if (adminNav && isAdmin) {
        adminNav.style.display = "block";
    }

    // Load details from AWS table / fallback
    loadProfileFromAWS();
});

// Load profiles from AWS/local fallback dynamically
async function loadProfileFromAWS() {
    const userId = localStorage.getItem("userId") || "guest_123";
    try {
        const result = await getUserProfile(userId);
        if (result.success && result.data) {
            originalProfile.name = result.data.name || "Passenger User";
            originalProfile.email = result.data.email || "passenger@gmail.com";
            originalProfile.phone = result.data.phone || result.data.mobile || "9999988888";

            // Sync local cache
            localStorage.setItem("userName", originalProfile.name);
            localStorage.setItem("userEmail", originalProfile.email);
            localStorage.setItem("userPhone", originalProfile.phone);
        }
    } catch (e) {
        console.error("Failed to sync profile from AWS:", e);
    }

    // Render headers
    document.getElementById("profileName").innerText = originalProfile.name;
    document.getElementById("profileEmail").innerText = originalProfile.email;

    // Set initials in avatar
    const initials = originalProfile.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
    document.getElementById("userInitials").innerText = initials || "PE";

    // Fill input structures
    document.getElementById("profName").value = originalProfile.name;
    document.getElementById("profEmail").value = originalProfile.email;
    document.getElementById("profPhone").value = originalProfile.phone;
}

// Toggle Edit Mode active state
function toggleEditMode() {
    document.getElementById("profName").disabled = false;
    document.getElementById("profEmail").disabled = false;
    document.getElementById("profPhone").disabled = false;

    document.getElementById("btnEditProfile").style.display = "none";
    document.getElementById("btnSaveProfile").style.display = "inline-block";
    document.getElementById("btnCancelEdit").style.display = "inline-block";
}

// Cancel editing and restore fields
function cancelEditMode() {
    document.getElementById("profName").disabled = true;
    document.getElementById("profEmail").disabled = true;
    document.getElementById("profPhone").disabled = true;

    document.getElementById("profName").value = originalProfile.name;
    document.getElementById("profEmail").value = originalProfile.email;
    document.getElementById("profPhone").value = originalProfile.phone;

    document.getElementById("profName").classList.remove("is-invalid");
    document.getElementById("profEmail").classList.remove("is-invalid");
    document.getElementById("profPhone").classList.remove("is-invalid");

    document.getElementById("btnEditProfile").style.display = "inline-block";
    document.getElementById("btnSaveProfile").style.display = "none";
    document.getElementById("btnCancelEdit").style.display = "none";

    showToast("Edits cancelled.", "info");
}

// Validation check and submission logic
async function saveProfileChanges() {
    const nameInput = document.getElementById("profName");
    const emailInput = document.getElementById("profEmail");
    const phoneInput = document.getElementById("profPhone");

    let isValid = true;

    // Validate Name
    if (!nameInput.value.trim()) {
        nameInput.classList.add("is-invalid");
        isValid = false;
    } else {
        nameInput.classList.remove("is-invalid");
    }

    // Validate Email
    if (!emailInput.value || !emailInput.checkValidity()) {
        emailInput.classList.add("is-invalid");
        isValid = false;
    } else {
        emailInput.classList.remove("is-invalid");
    }

    // Validate Phone
    const phoneRegex = /^[6-9][0-9]{9}$/;
    if (!phoneRegex.test(phoneInput.value)) {
        phoneInput.classList.add("is-invalid");
        isValid = false;
    } else {
        phoneInput.classList.remove("is-invalid");
    }

    if (!isValid) {
        showToast("Please enter correct profile details.", "warning");
        return;
    }

    showLoader("Saving profile updates...");

    const userId = localStorage.getItem("userId") || "guest_123";
    try {
        const result = await updateUserProfile(
            userId,
            nameInput.value.trim(),
            emailInput.value.trim(),
            phoneInput.value.trim()
        );

        hideLoader();

        if (result.success) {
            localStorage.setItem("userName", nameInput.value.trim());
            localStorage.setItem("userEmail", emailInput.value.trim());
            localStorage.setItem("userPhone", phoneInput.value.trim());

            // Update in-memory cached state
            originalProfile.name = nameInput.value.trim();
            originalProfile.email = emailInput.value.trim();
            originalProfile.phone = phoneInput.value.trim();

            // Toggle locks back
            nameInput.disabled = true;
            emailInput.disabled = true;
            phoneInput.disabled = true;

            document.getElementById("btnEditProfile").style.display = "inline-block";
            document.getElementById("btnSaveProfile").style.display = "none";
            document.getElementById("btnCancelEdit").style.display = "none";

            // Refresh display
            document.getElementById("profileName").innerText = originalProfile.name;
            document.getElementById("profileEmail").innerText = originalProfile.email;
            const initials = originalProfile.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
            document.getElementById("userInitials").innerText = initials || "PE";

            showToast("Profile details updated successfully!", "success");
        } else {
            showToast(result.message || "Failed to update profile details.", "error");
        }
    } catch (err) {
        hideLoader();
        showToast("Server lookup fail. Try again.", "error");
        console.error(err);
    }
}

// Logouts session
function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html";
}
