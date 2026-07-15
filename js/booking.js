// Global booking checkout state
let checkoutData = null;

// On Page Load
document.addEventListener("DOMContentLoaded", () => {
    // Read checkout payload
    const rawData = sessionStorage.getItem("activeBookingCheckout");
    if (!rawData) {
        showToast("Session expired. Returning to Home...", "error");
        setTimeout(() => window.location.href = "home.html", 1500);
        return;
    }

    checkoutData = JSON.parse(rawData);

    // Set navbar theme icon / admin check
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    const adminNav = document.getElementById("admin-nav-item");
    if (adminNav && isAdmin) {
        adminNav.style.display = "block";
    }

    // Populate side panel summary
    document.getElementById("checkRoute").innerHTML = `${checkoutData.fromCity} &rarr; ${checkoutData.toCity}`;
    document.getElementById("checkDate").innerText = formatDateFriendly(checkoutData.travelDate);
    document.getElementById("checkBus").innerText = `${checkoutData.busName} | ${checkoutData.busType}`;
    document.getElementById("checkSeats").innerText = checkoutData.selectedSeats.join(", ");

    document.getElementById("checkBaseFare").innerText = `₹${checkoutData.baseFare}`;
    document.getElementById("checkTaxes").innerText = `₹${checkoutData.taxesFees}`;
    document.getElementById("checkTotalAmount").innerText = `₹${checkoutData.totalPayable}`;

    // Autofill contact info if available in session/session cache
    const defaultEmail = localStorage.getItem("userEmail") || "";
    const defaultPhone = localStorage.getItem("userPhone") || "";
    document.getElementById("contactEmail").value = defaultEmail;
    document.getElementById("contactMobile").value = defaultPhone;

    // Render dynamic passenger fields
    renderPassengerFields();
});

// Format Date
function formatDateFriendly(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Generate Name/Age inputs per seat selected
function renderPassengerFields() {
    const container = document.getElementById("dynamicPassengersContainer");
    if (!container || !checkoutData) return;

    container.innerHTML = "";

    checkoutData.selectedSeats.forEach((seat, index) => {
        const card = document.createElement("div");
        card.className = "mb-4 pb-4 border-bottom";
        if (index === checkoutData.selectedSeats.length - 1) {
            card.className = "mb-0 pb-0 border-bottom-0";
        }

        card.innerHTML = `
      <div class="d-flex align-items-center gap-2 mb-3">
        <span class="badge bg-danger rounded-circle d-flex align-items-center justify-content-center" style="width:24px; height:24px;">${index + 1}</span>
        <h6 class="fw-bold mb-0 text-dark">Passenger (Seat ${seat})</h6>
      </div>
      
      <div class="row g-3">
        <div class="col-md-5">
          <label class="form-label small fw-semibold">Full Name</label>
          <input type="text" class="form-control form-control-custom passenger-name" placeholder="Passenger Name" required>
          <div class="invalid-feedback">Name is required.</div>
        </div>
        
        <div class="col-md-3">
          <label class="form-label small fw-semibold">Age</label>
          <input type="number" class="form-control form-control-custom passenger-age" min="1" max="120" placeholder="Age" required>
          <div class="invalid-feedback">Age must be 1-120.</div>
        </div>
        
        <div class="col-md-4">
          <label class="form-label small fw-semibold">Gender</label>
          <select class="form-select form-control-custom passenger-gender" required>
            <option value="" disabled selected>Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
          <div class="invalid-feedback">Gender is required.</div>
        </div>
      </div>
    `;
        container.appendChild(card);
    });
}

// Handle dynamic details form submissions
function submitPassengerDetails() {
    const emailInput = document.getElementById("contactEmail");
    const mobileInput = document.getElementById("contactMobile");

    let isContactValid = true;

    // Validate Email
    if (!emailInput.value || !emailInput.checkValidity()) {
        emailInput.classList.add("is-invalid");
        isContactValid = false;
    } else {
        emailInput.classList.remove("is-invalid");
    }

    // Validate Mobile
    const mobileRegex = /^[6-9][0-9]{9}$/;
    if (!mobileRegex.test(mobileInput.value)) {
        mobileInput.classList.add("is-invalid");
        isContactValid = false;
    } else {
        mobileInput.classList.remove("is-invalid");
    }

    if (!isContactValid) {
        showToast("Please ensure email and mobile contact fields are correct.", "warning");
        return;
    }

    // Validate passengers list inputs
    const nameElems = document.querySelectorAll(".passenger-name");
    const ageElems = document.querySelectorAll(".passenger-age");
    const genderElems = document.querySelectorAll(".passenger-gender");

    let isPassengersValid = true;
    const passengersList = [];

    checkoutData.selectedSeats.forEach((seat, idx) => {
        const nameVal = nameElems[idx].value.trim();
        const ageVal = parseInt(ageElems[idx].value);
        const genderVal = genderElems[idx].value;

        if (!nameVal) {
            nameElems[idx].classList.add("is-invalid");
            isPassengersValid = false;
        } else {
            nameElems[idx].classList.remove("is-invalid");
        }

        if (isNaN(ageVal) || ageVal < 1 || ageVal > 120) {
            ageElems[idx].classList.add("is-invalid");
            isPassengersValid = false;
        } else {
            ageElems[idx].classList.remove("is-invalid");
        }

        if (!genderVal) {
            genderElems[idx].classList.add("is-invalid");
            isPassengersValid = false;
        } else {
            genderElems[idx].classList.remove("is-invalid");
        }

        if (isPassengersValid) {
            passengersList.push({
                seatNumber: seat,
                name: nameVal,
                age: ageVal,
                gender: genderVal
            });
        }
    });

    if (!isPassengersValid) {
        showToast("Please complete passenger fields for all selected seats.", "warning");
        return;
    }

    // Update object with forms
    checkoutData.contactEmail = emailInput.value.trim();
    checkoutData.contactPhone = mobileInput.value.trim();
    checkoutData.passengers = passengersList;

    // Save session state
    sessionStorage.setItem("activeBookingCheckout", JSON.stringify(checkoutData));

    showLoader("Confirming passenger details...");

    setTimeout(() => {
        hideLoader();
        window.location.href = "payment.html";
    }, 1000);
}

function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html";
}