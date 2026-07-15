// Handle Register Form Submit
async function handleRegisterSubmit(event) {
    event.preventDefault();

    const form = document.getElementById("registerForm");
    const nameInput = document.getElementById("fullName");
    const emailInput = document.getElementById("email");
    const mobileInput = document.getElementById("mobile");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirmPassword");

    let isValid = true;

    // Validate Full Name
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

    // Validate Mobile (10 digits starting with 6-9)
    const mobileRegex = /^[6-9][0-9]{9}$/;
    if (!mobileRegex.test(mobileInput.value)) {
        mobileInput.classList.add("is-invalid");
        isValid = false;
    } else {
        mobileInput.classList.remove("is-invalid");
    }

    // Validate Password length
    if (passwordInput.value.length < 6) {
        passwordInput.classList.add("is-invalid");
        isValid = false;
    } else {
        passwordInput.classList.remove("is-invalid");
    }

    // Validate Confirm Password matching
    if (passwordInput.value !== confirmPasswordInput.value) {
        confirmPasswordInput.classList.add("is-invalid");
        isValid = false;
    } else {
        confirmPasswordInput.classList.remove("is-invalid");
    }

    if (!isValid) {
        showToast("Please ensure all inputs conform to validations.", "error");
        return;
    }

    showLoader("Creating your profile...");

    try {
        const result = await registerUser(
            nameInput.value.trim(),
            emailInput.value.trim(),
            mobileInput.value.trim(),
            passwordInput.value
        );

        hideLoader();

        if (result.success) {
            // Store session details
            localStorage.setItem("userId", result.data.userId);
            localStorage.setItem("userName", result.data.name);
            localStorage.setItem("userEmail", result.data.email);
            localStorage.setItem("userPhone", result.data.mobile);

            showToast("Account created successfully! Redirecting...", "success");

            setTimeout(() => {
                window.location.href = "home.html";
            }, 1500);
        } else {
            showToast(result.message, "error");
        }
    } catch (error) {
        hideLoader();
        showToast("Server connection error during registration.", "error");
        console.error("Registration Error:", error);
    }
}