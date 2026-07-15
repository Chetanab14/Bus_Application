// Handle Login Form Submit
async function handleLoginSubmit(event) {
    event.preventDefault();

    const form = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");

    let isValid = true;

    // Validate Email or Admin username
    const emailVal = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal || (emailVal !== "admin" && !emailRegex.test(emailVal))) {
        emailInput.classList.add("is-invalid");
        isValid = false;
    } else {
        emailInput.classList.remove("is-invalid");
    }

    // Validate Password
    if (!passwordInput.value) {
        passwordInput.classList.add("is-invalid");
        isValid = false;
    } else {
        passwordInput.classList.remove("is-invalid");
    }

    if (!isValid) {
        showToast("Please correct the validation errors.", "error");
        return;
    }

    showLoader("Logging in...");

    try {
        const result = await loginUserAPI(emailInput.value.trim(), passwordInput.value);

        hideLoader();

        if (result.success) {
            // Store session details
            localStorage.setItem("userId", result.data.userId);
            localStorage.setItem("userName", result.data.name);
            localStorage.setItem("userEmail", result.data.email);
            localStorage.setItem("userPhone", result.data.mobile || "");

            showToast(`Welcome back, ${result.data.name}!`, "success");

            // Redirect based on role
            setTimeout(() => {
                if (result.data.isAdmin || result.data.userId === "admin_id") {
                    localStorage.setItem("isAdmin", "true");
                    window.location.href = "admin.html";
                } else {
                    localStorage.removeItem("isAdmin");
                    window.location.href = "home.html";
                }
            }, 1000);
        } else {
            showToast(result.message, "error");
        }
    } catch (error) {
        hideLoader();
        showToast("An unexpected error occurred. Please try again.", "error");
        console.error("Login Error:", error);
    }
}

// Toggle Password Visibility
function togglePasswordVisibility() {
    const passwordInput = document.getElementById("password");
    const showPasswordCheckbox = document.getElementById("showPassword");
    if (passwordInput && showPasswordCheckbox) {
        passwordInput.type = showPasswordCheckbox.checked ? "text" : "password";
    }
}

// Forgot Password Handler
function handleForgotPassword(event) {
    event.preventDefault();
    const emailInput = document.getElementById("email");
    const emailVal = emailInput.value.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal || (emailVal !== "admin" && !emailRegex.test(emailVal))) {
        showToast("Please enter your registered email address or username first.", "warning");
        emailInput.classList.add("is-invalid");
        return;
    }

    showLoader("Sending password reset link...");
    setTimeout(() => {
        hideLoader();
        showToast(`Password reset link has been dispatched to ${emailVal}. Please check!`, "success");
    }, 1500);
}

// Auto redirect if already logged in
function checkAlreadyLoggedIn() {
    const userId = localStorage.getItem("userId");
    if (userId) {
        if (localStorage.getItem("isAdmin") === "true") {
            window.location.href = "admin.html";
        } else {
            window.location.href = "home.html";
        }
    }
}

// Execute check
checkAlreadyLoggedIn();