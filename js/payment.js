// Global payment check state
let checkoutData = null;

// On Page Load
document.addEventListener("DOMContentLoaded", () => {
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

    // Populate UI Fare checkout sidebar
    document.getElementById("paySeats").innerText = checkoutData.selectedSeats.join(", ");
    document.getElementById("payAmountVal").innerText = `₹${checkoutData.totalPayable}`;
});

// Format input card digits spacing: 0000 0000 0000 0000
function formatCardInput(input) {
    let val = input.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    let matches = val.match(/.{1,4}/g);
    let match = matches ? matches.join(' ') : '';
    input.value = match;
}

// Format expiry: MM/YY
function formatExpiryInput(input) {
    let val = input.value.replace(/\D/g, '');
    if (val.length >= 2) {
        input.value = val.substring(0, 2) + '/' + val.substring(2, 4);
    } else {
        input.value = val;
    }
}

// Bank selector for Netbanking tab
function selectBank(bankName) {
    document.getElementById("selectedBankVal").value = bankName;
    const alertBox = document.getElementById("bankSelectedAlert");
    alertBox.innerText = `Selected Bank: ${bankName} Portal. Simulation authentication active.`;
    alertBox.style.display = "block";
}

// Simulated Payment execution
async function simulatePaymentProcess() {
    const activeTabEl = document.querySelector("#paymentTabs .list-group-item.active");
    const activeTabId = activeTabEl.id;

    let isValid = true;

    if (activeTabId === "card-tab") {
        // Basic Card inputs verification
        const cName = document.getElementById("cardName").value.trim();
        const cNum = document.getElementById("cardNumber").value.replace(/\s/g, '');
        const cExp = document.getElementById("cardExpiry").value;
        const cCvv = document.getElementById("cardCvv").value;

        if (!cName) {
            document.getElementById("cardName").classList.add("is-invalid");
            isValid = false;
        } else {
            document.getElementById("cardName").classList.remove("is-invalid");
        }

        if (cNum.length < 16) {
            document.getElementById("cardNumber").classList.add("is-invalid");
            isValid = false;
        } else {
            document.getElementById("cardNumber").classList.remove("is-invalid");
        }

        if (cExp.length < 5) {
            document.getElementById("cardExpiry").classList.add("is-invalid");
            isValid = false;
        } else {
            document.getElementById("cardExpiry").classList.remove("is-invalid");
        }

        if (cCvv.length < 3) {
            document.getElementById("cardCvv").classList.add("is-invalid");
            isValid = false;
        } else {
            document.getElementById("cardCvv").classList.remove("is-invalid");
        }

        if (!isValid) {
            showToast("Please fill all card information correctly.", "warning");
            return;
        }
    } else if (activeTabId === "net-tab") {
        const selectedBank = document.getElementById("selectedBankVal").value;
        if (!selectedBank) {
            showToast("Please select a bank to proceed with Net Banking.", "warning");
            return;
        }
    } else if (activeTabId === "upi-tab") {
        const upiId = document.getElementById("upiId").value.trim();
        if (upiId && !validateUPI(upiId)) {
            showToast("Please check formatting of UPI ID (e.g. mobile@ybl).", "warning");
            return;
        }
    }

    showLoader("Authorizing payment transaction...");

    // Simulate gateway auth lag
    setTimeout(async () => {
        try {
            const bookingPayload = {
                userId: localStorage.getItem("userId") || "guest_123",
                busId: checkoutData.busId,
                busName: checkoutData.busName,
                seats: checkoutData.selectedSeats,
                fromCity: checkoutData.fromCity,
                toCity: checkoutData.toCity,
                travelDate: checkoutData.travelDate,
                price: checkoutData.totalPayable,
                passenger: checkoutData.passengers, // passengers array
                amountPaid: checkoutData.totalPayable
            };

            const result = await bookSeats(bookingPayload);

            hideLoader();

            if (result.success) {
                // Construct final receipt ticket
                const ticketReceipt = {
                    bookingId: result.bookingId,
                    passengerName: checkoutData.passengers[0].name, // Main passenger contact
                    busName: checkoutData.busName,
                    seats: checkoutData.selectedSeats,
                    fromCity: checkoutData.fromCity,
                    toCity: checkoutData.toCity,
                    travelDate: checkoutData.travelDate,
                    amountPaid: checkoutData.totalPayable
                };

                // Cache finalized ticket
                sessionStorage.setItem("confirmedBookingTicket", JSON.stringify(ticketReceipt));

                // Remove active checkout cache
                sessionStorage.removeItem("activeBookingCheckout");

                showToast("Payment Authorized! Booking Confirmed.", "success");

                setTimeout(() => {
                    window.location.href = "success.html";
                }, 1200);
            } else {
                showToast(result.message || "Failed to make seat reservation.", "error");
            }
        } catch (err) {
            hideLoader();
            showToast("Connection validation failure. Try again.", "error");
            console.error(err);
        }
    }, 2000);
}

// VPA regex
function validateUPI(id) {
    return /^[\w\.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(id);
}

function logoutUser() {
    localStorage.clear();
    window.location.href = "login.html";
}
